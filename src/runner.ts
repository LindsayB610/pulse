import {
  createPulseEvent,
  generateNextOccurrence,
  markOccurrenceDue,
  type PulseDefinition,
  type PulseEvent,
  type PulseOccurrence,
} from "./model.js";
import type { PulseState, PulseStateStore } from "./storage.js";

export type NotificationInput = {
  channel: string;
  pulse: PulseDefinition;
  occurrence: PulseOccurrence;
  now: Date;
};

export type NotificationResult = {
  ok: boolean;
  detail?: string;
};

export type NotificationDispatcher = {
  send(input: NotificationInput): Promise<NotificationResult> | NotificationResult;
};

export type PulseRunnerTickInput = {
  now: Date;
  pulses: PulseDefinition[];
  stateStore: PulseStateStore;
  notifier: NotificationDispatcher;
  redactValues?: string[];
};

export type PulsePollingRunnerInput = Omit<PulseRunnerTickInput, "now"> & {
  now?: () => Date;
  intervalMs: number;
};

export type PulseRunnerTickResult = {
  scheduled: number;
  becameDue: number;
  notificationsSent: number;
};

const defaultRepeatEveryMinutes = 60;
const defaultChannels = ["console"];

export async function runPulseRunnerTick(input: PulseRunnerTickInput): Promise<PulseRunnerTickResult> {
  const state = input.stateStore.read();
  const result: PulseRunnerTickResult = {
    scheduled: 0,
    becameDue: 0,
    notificationsSent: 0,
  };

  for (const pulse of input.pulses) {
    const nextOccurrence = generateNextOccurrence(pulse, {
      after: input.now,
      existingOccurrences: state.occurrences,
      includeMissed: true,
    });
    if (nextOccurrence) {
      state.occurrences.push(nextOccurrence);
      state.events.push(
        createPulseEvent({
          pulseId: pulse.id,
          occurrenceId: nextOccurrence.id,
          type: "occurrence_scheduled",
          at: input.now,
          metadata: { dueAt: nextOccurrence.dueAt },
        }),
      );
      result.scheduled += 1;
    }
  }

  for (const occurrence of state.occurrences) {
    if (occurrence.state === "scheduled") {
      const nextState = markOccurrenceDue(occurrence, input.now);
      if (nextState !== occurrence && nextState.state === "due") {
        Object.assign(occurrence, nextState);
        state.events.push(
          createPulseEvent({
            pulseId: occurrence.pulseId,
            occurrenceId: occurrence.id,
            type: "occurrence_became_due",
            at: input.now,
          }),
        );
        result.becameDue += 1;
      }
    }

    if (occurrence.state !== "due") {
      continue;
    }

    const pulse = input.pulses.find((candidate) => candidate.id === occurrence.pulseId);
    if (!pulse) {
      continue;
    }

    const channels = pulse.notificationPolicy?.channels ?? defaultChannels;
    const repeatEveryMinutes = pulse.notificationPolicy?.repeatEveryMinutes ?? defaultRepeatEveryMinutes;

    for (const channel of channels) {
      if (!shouldSendNotification(state.events, occurrence, channel, input.now, repeatEveryMinutes)) {
        continue;
      }

      const sendResult = await sendNotification(input.notifier, {
        channel,
        pulse,
        occurrence,
        now: input.now,
      });
      const detail = redactNotificationDetail(sendResult.detail ?? "", input.redactValues ?? []);
      state.events.push(
        createPulseEvent({
          pulseId: pulse.id,
          occurrenceId: occurrence.id,
          type: "notification_sent",
          at: input.now,
          metadata: {
            channel,
            ok: sendResult.ok,
            detail,
          },
        }),
      );
      result.notificationsSent += 1;
    }
  }

  input.stateStore.write(state);
  return result;
}

export function createPollingRunner(input: PulsePollingRunnerInput) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const now = input.now ?? (() => new Date());

  return {
    start() {
      if (timer !== undefined) {
        return;
      }
      timer = setInterval(() => {
        void runPulseRunnerTick({ ...input, now: now() });
      }, input.intervalMs);
    },
    stop() {
      if (timer === undefined) {
        return;
      }
      clearInterval(timer);
      timer = undefined;
    },
  };
}

async function sendNotification(
  notifier: NotificationDispatcher,
  input: NotificationInput,
): Promise<NotificationResult> {
  try {
    return await notifier.send(input);
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function redactNotificationDetail(detail: string, redactValues: string[] = []): string {
  return redactValues
    .filter((value) => value !== "")
    .reduce((redacted, value) => redacted.split(value).join("[redacted]"), detail);
}

function shouldSendNotification(
  events: PulseEvent[],
  occurrence: PulseOccurrence,
  channel: string,
  now: Date,
  repeatEveryMinutes: number,
): boolean {
  const repeatMs = repeatEveryMinutes * 60 * 1000;
  const lastSentAt = events
    .filter((event) => {
      return (
        event.type === "notification_sent" &&
        event.occurrenceId === occurrence.id &&
        event.metadata?.channel === channel
      );
    })
    .map((event) => Date.parse(event.at))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return lastSentAt === undefined || now.getTime() - lastSentAt >= repeatMs;
}
