import type { NotificationDispatcher, NotificationInput } from "./runner.js";

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
      const response = await fetchImpl(`${server}/${encodeURIComponent(options.topic)}`, {
        method: "POST",
        headers: {
          ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
          "content-type": "text/plain; charset=utf-8",
          priority: "high",
          tags: "bell",
          title: `Pulse: ${input.pulse.title}`,
          ...(doneActionUrl === undefined && snoozeActionUrl === undefined
            ? {}
            : { actions: notificationActions(doneActionUrl, snoozeActionUrl) }),
        },
        body: formatNtfyBody(input),
      });

      if (!response.ok) {
        throw new Error(`ntfy server returned ${response.status}`);
      }

      return {
        ok: true,
        detail: "sent",
      };
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

function notificationActions(doneActionUrl: string | undefined, snoozeActionUrl: string | undefined): string {
  return [
    ...(doneActionUrl === undefined ? [] : [`http, Mark done, ${doneActionUrl}, method=POST, clear=true`]),
    ...(snoozeActionUrl === undefined ? [] : [`http, Snooze 30 min, ${snoozeActionUrl}, method=POST, clear=true`]),
  ].join("; ");
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
    "Mark Done to stop reminders.",
  ].join("\n");
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
