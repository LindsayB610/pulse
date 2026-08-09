import {
  applyOccurrenceAction,
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
  onTick?: () => void;
};

export type PulseRunnerTickResult = {
  scheduled: number;
  becameDue: number;
  notificationsSent: number;
};

const defaultRepeatEveryMinutes = 60;
const defaultChannels = ["console"];
const automaticSnoozeGraceMinutes = 2;
const automaticSnoozeMinutes = 30;

export async function runPulseRunnerTick(input: PulseRunnerTickInput): Promise<PulseRunnerTickResult> {
  return input.stateStore.withExclusive(() => runPulseRunnerTickExclusive(input));
}

async function runPulseRunnerTickExclusive(input: PulseRunnerTickInput): Promise<PulseRunnerTickResult> {
  const state = input.stateStore.read();
  const result: PulseRunnerTickResult = {
    scheduled: 0,
    becameDue: 0,
    notificationsSent: 0,
  };

  retainEarliestOpenOccurrencePerPulse(state, input.pulses);

  for (const pulse of input.pulses) {
    if (state.occurrences.some((occurrence) => occurrence.pulseId === pulse.id && occurrence.state !== "done")) {
      continue;
    }
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

  for (let occurrenceIndex = 0; occurrenceIndex < state.occurrences.length; occurrenceIndex += 1) {
    let occurrence = state.occurrences[occurrenceIndex];
    if (occurrence === undefined) continue;
    let justBecameDue = false;
    if (occurrence.state === "scheduled") {
      const nextState = markOccurrenceDue(occurrence, input.now);
      if (nextState !== occurrence && nextState.state === "due") {
        state.occurrences[occurrenceIndex] = nextState;
        occurrence = nextState;
        justBecameDue = true;
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

    if (!justBecameDue && shouldAutomaticallySnooze(state.events, occurrence, input.now)) {
      const snoozed = applyOccurrenceAction(occurrence, {
        type: "snooze",
        at: input.now,
        until: new Date(input.now.getTime() + automaticSnoozeMinutes * 60 * 1000),
      });
      Object.assign(occurrence, snoozed);
      state.events.push(
        createPulseEvent({
          pulseId: pulse.id,
          occurrenceId: occurrence.id,
          type: "occurrence_snoozed",
          at: input.now,
          metadata: { until: snoozed.dueAt, source: "automatic-no-action" },
        }),
      );
      continue;
    }

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

function shouldAutomaticallySnooze(
  events: PulseEvent[],
  occurrence: PulseOccurrence,
  now: Date,
): boolean {
  const lastSuccessfulSendAt = events
    .filter((event) => event.type === "notification_sent" && event.occurrenceId === occurrence.id && event.metadata?.ok !== false)
    .map((event) => Date.parse(event.at))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];

  return lastSuccessfulSendAt !== undefined
    && now.getTime() - lastSuccessfulSendAt >= automaticSnoozeGraceMinutes * 60 * 1000;
}

/**
 * A recurring pulse has one active obligation at a time. Older runner builds
 * could pre-schedule future weeks on every tick; retain the earliest open
 * occurrence so that stale state self-heals instead of producing a backlog.
 */
function retainEarliestOpenOccurrencePerPulse(state: PulseState, pulses: PulseDefinition[]): void {
  const pulseIds = new Set(pulses.map((pulse) => pulse.id));
  const retained = new Set<string>();
  for (const occurrence of [...state.occurrences]
    .filter((occurrence) => pulseIds.has(occurrence.pulseId) && occurrence.state !== "done")
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))) {
    if (!retained.has(occurrence.pulseId)) retained.add(occurrence.pulseId);
  }
  state.occurrences = state.occurrences.filter((occurrence) => {
    return occurrence.state === "done" || !pulseIds.has(occurrence.pulseId) || retained.has(occurrence.pulseId) && occurrence.id === earliestOpenOccurrenceId(state, occurrence.pulseId);
  });
}

function earliestOpenOccurrenceId(state: PulseState, pulseId: string): string | undefined {
  return state.occurrences
    .filter((occurrence) => occurrence.pulseId === pulseId && occurrence.state !== "done")
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))[0]?.id;
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
        void runPulseRunnerTick({ ...input, now: now() })
          .then(() => input.onTick?.())
          .catch((error) => {
            console.error("Pulse runner tick failed:", error);
          });
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
