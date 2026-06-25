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

export type SmsMessage = {
  from: string;
  to: string;
  body: string;
};

export type SmsTransport = {
  sendSms(message: SmsMessage): Promise<{ id?: string } | void> | { id?: string } | void;
};

export type TwilioSmsAdapterOptions = {
  from: string;
  to: string;
  transport: SmsTransport;
};

export type TwilioSmsTransportOptions = {
  accountSid: string;
  authToken: string;
  fetch?: FetchLike;
};

export type NotificationEnv = Record<string, string | undefined>;

export type NotificationDispatcherFromEnvOptions = {
  writer?: ConsoleNotificationWriter;
  fetch?: FetchLike;
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

export function createTwilioSmsNotificationAdapter(options: TwilioSmsAdapterOptions): NotificationDispatcher {
  return {
    async send(input) {
      const result = await options.transport.sendSms({
        from: options.from,
        to: options.to,
        body: formatSmsBody(input),
      });

      return {
        ok: true,
        detail: result?.id ?? "sent",
      };
    },
  };
}

export function createTwilioSmsTransport(options: TwilioSmsTransportOptions): SmsTransport {
  const fetchImpl = options.fetch ?? defaultFetch;

  return {
    async sendSms(message) {
      const response = await fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(options.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            authorization: `Basic ${base64(`${options.accountSid}:${options.authToken}`)}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: message.from,
            To: message.to,
            Body: message.body,
          }).toString(),
        },
      );

      if (!response.ok) {
        throw new Error(`Twilio API returned ${response.status}`);
      }

      const payload = response.json ? await response.json() : undefined;
      const id = readMessageId(payload);
      return id === undefined ? { id: "sent" } : { id };
    },
  };
}

export function createNotificationDispatcherFromEnv(
  env: NotificationEnv,
  options: NotificationDispatcherFromEnvOptions = {},
): NotificationDispatcher {
  const channel = env.PULSE_NOTIFICATION_CHANNEL ?? "console";

  if (channel === "console") {
    return createConsoleNotificationAdapter(options.writer);
  }

  if (channel === "sms" || channel === "twilio-sms") {
    const accountSid = requiredEnv(env, "PULSE_TWILIO_ACCOUNT_SID");
    const authToken = requiredEnv(env, "PULSE_TWILIO_AUTH_TOKEN");
    const from = requiredEnv(env, "PULSE_TWILIO_FROM");
    const to = requiredEnv(env, "PULSE_SMS_TO");

    return createTwilioSmsNotificationAdapter({
      from,
      to,
      transport: createTwilioSmsTransport({
        accountSid,
        authToken,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    });
  }

  throw new Error(`Unsupported PULSE_NOTIFICATION_CHANNEL: ${channel}`);
}

const consoleWriter: ConsoleNotificationWriter = {
  write(line) {
    console.log(line);
  },
};

function formatNotificationLine(input: NotificationInput): string {
  return `[pulse] ${input.channel}: ${input.pulse.title} due at ${input.occurrence.dueAt}`;
}

function formatSmsBody(input: NotificationInput): string {
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

function readMessageId(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const id = payload.sid ?? payload.id;
  return typeof id === "string" && id !== "" ? id : undefined;
}

function requiredEnv(env: NotificationEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Set ${key} before using PULSE_NOTIFICATION_CHANNEL=sms. See docs/env-vars.md for setup guidance.`,
    );
  }
  return value;
}

function base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
