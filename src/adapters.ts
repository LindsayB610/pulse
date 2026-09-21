import type { NotificationDispatcher, NotificationInput } from "./runner.js";
import { isPulseNtfySequenceId, ntfySequenceIdForOccurrence } from "./ntfy-sequence.js";

export type ConsoleNotificationWriter = {
  write(line: string): void;
};

export type FetchResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<FetchResponse>;

export type NtfyNotificationAdapterOptions = {
  topic: string;
  server?: string;
  token?: string;
  /** A one-time acknowledgement endpoint attached to every due notification. */
  doneActionUrl?: (input: NotificationInput) => string | Promise<string>;
  snoozeActionUrl?: (input: NotificationInput) => string | Promise<string>;
  fetch?: FetchLike;
};

export type NotificationEnv = Record<string, string | undefined>;

export type NotificationDispatcherFromEnvOptions = {
  writer?: ConsoleNotificationWriter;
  fetch?: FetchLike;
  doneActionUrl?: (input: NotificationInput) => string | Promise<string>;
  snoozeActionUrl?: (input: NotificationInput) => string | Promise<string>;
};

export function createConsoleNotificationAdapter(
  writer: ConsoleNotificationWriter = consoleWriter,
): NotificationDispatcher {
  return {
    send(input) {
      writer.write(formatNotificationLine(input));
      return { ok: true };
    },
  };
}

export function createNtfyNotificationAdapter(options: NtfyNotificationAdapterOptions): NotificationDispatcher {
  const fetchImpl = options.fetch ?? defaultFetch;
  const server = normalizeNtfyServer(options.server ?? "https://ntfy.sh");

  return {
    async send(input) {
      const doneActionUrl = options.doneActionUrl === undefined
        ? undefined
        : await options.doneActionUrl(input);
      const snoozeActionUrl = options.snoozeActionUrl === undefined
        ? undefined
        : await options.snoozeActionUrl(input);
      const sequenceId = ntfySequenceIdForOccurrence(input.occurrence.id);
      const actions = notificationActions(
        doneActionUrl,
        snoozeActionUrl,
        input.pulse.notificationPolicy?.snoozeEveryMinutes ?? 30,
      );
      const response = await fetchImpl(server, {
        method: "POST",
        headers: {
          ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          topic: options.topic,
          message: formatNtfyBody(input),
          title: `Pulse: ${input.pulse.title}`,
          priority: 5,
          tags: ["bell"],
          sequence_id: sequenceId,
          ...(actions.length === 0 ? {} : { actions }),
        }),
      });

      if (!response.ok) {
        throw new Error(`ntfy server returned ${response.status}`);
      }

      return {
        ok: true,
        detail: "sent",
        sequenceId,
      };
    },
    async deleteOccurrenceSequence(input) {
      if (!isPulseNtfySequenceId(input.sequenceId)) {
        throw new Error("A valid Pulse ntfy sequence ID is required for deletion.");
      }
      const response = await fetchImpl(ntfySequenceUrl(server, options.topic, input.sequenceId), {
        method: "DELETE",
        headers: options.token === undefined ? {} : { authorization: `Bearer ${options.token}` },
        body: "",
      });
      if (!response.ok) throw new Error(`ntfy server returned ${response.status} while deleting a notification sequence`);
      return { ok: true, detail: "deleted", sequenceId: input.sequenceId };
    },
  };
}

export function createNotificationDispatcherFromEnv(
  env: NotificationEnv,
  options: NotificationDispatcherFromEnvOptions = {},
): NotificationDispatcher {
  const provider = env.PULSE_NOTIFY_PROVIDER ?? "console";

  if (provider === "console" || provider === "noop") {
    return createConsoleNotificationAdapter(options.writer);
  }

  if (provider === "ntfy") {
    return createNtfyNotificationAdapter({
      topic: requiredEnv(env, "PULSE_NTFY_TOPIC"),
      ...(env.PULSE_NTFY_SERVER === undefined || env.PULSE_NTFY_SERVER === ""
        ? {}
        : { server: env.PULSE_NTFY_SERVER }),
      ...(env.PULSE_NTFY_TOKEN === undefined || env.PULSE_NTFY_TOKEN === ""
        ? {}
        : { token: env.PULSE_NTFY_TOKEN }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.doneActionUrl === undefined ? {} : { doneActionUrl: options.doneActionUrl }),
      ...(options.snoozeActionUrl === undefined ? {} : { snoozeActionUrl: options.snoozeActionUrl }),
    });
  }

  throw new Error(`Unsupported PULSE_NOTIFY_PROVIDER: ${provider}`);
}

type NtfyHttpAction = {
  action: "http";
  label: string;
  url: string;
  method: "POST";
  clear: true;
};

function notificationActions(
  doneActionUrl: string | undefined,
  snoozeActionUrl: string | undefined,
  snoozeEveryMinutes: number,
): NtfyHttpAction[] {
  return [
    ...(doneActionUrl === undefined
      ? []
      : [{ action: "http", label: "Mark done", url: doneActionUrl, method: "POST", clear: true } satisfies NtfyHttpAction]),
    ...(snoozeActionUrl === undefined
      ? []
      : [{
        action: "http",
        label: `Snooze ${formatSnoozeDuration(snoozeEveryMinutes)}`,
        url: snoozeActionUrl,
        method: "POST",
        clear: true,
      } satisfies NtfyHttpAction]),
  ];
}

function formatSnoozeDuration(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} min`;
}

const consoleWriter: ConsoleNotificationWriter = {
  write(line) {
    console.log(line);
  },
};

function formatNotificationLine(input: NotificationInput): string {
  return `[pulse] ${input.channel}: ${input.pulse.title} due at ${input.occurrence.dueAt}`;
}

function formatNtfyBody(input: NotificationInput): string {
  return [
    `Pulse due: ${input.pulse.title}`,
    `Due: ${input.occurrence.dueAt}`,
    ...seriesNotificationContext(input),
    "Mark Done to stop reminders.",
  ].join("\n");
}

function seriesNotificationContext(input: NotificationInput): string[] {
  if (input.occurrence.final === true) return ["Final reminder in this series."];
  const schedule = input.pulse.schedule;
  if (!("version" in schedule) || schedule.version !== 2 || schedule.type === "once") return [];
  if (schedule.end.type === "date") return [`Series ends ${schedule.end.date}.`];
  const ordinal = input.occurrence.ordinal;
  if (ordinal === undefined) return [];
  const remaining = schedule.end.occurrences - ordinal + 1;
  return remaining <= 3 ? [`${remaining} reminders remain in this series.`] : [];
}

async function defaultFetch(url: string, init: Parameters<FetchLike>[1]): Promise<FetchResponse> {
  if (globalThis.fetch === undefined) {
    throw new Error("Global fetch is not available in this Node runtime.");
  }

  return globalThis.fetch(url, init);
}

function requiredEnv(env: NotificationEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Set ${key} before using PULSE_NOTIFY_PROVIDER=ntfy. See docs/env-vars.md for setup guidance.`,
    );
  }
  return value;
}

function normalizeNtfyServer(server: string): string {
  const normalized = server.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(normalized)) {
    throw new Error("PULSE_NTFY_SERVER must be an http or https URL.");
  }
  return normalized;
}

function ntfySequenceUrl(server: string, topic: string, sequenceId: string): string {
  return `${server}/${encodeURIComponent(topic)}/${encodeURIComponent(sequenceId)}`;
}
