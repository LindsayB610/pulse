import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createNotificationDispatcherFromEnv,
  createConsoleNotificationAdapter,
  createTwilioSmsNotificationAdapter,
  createTwilioSmsTransport,
  createEmptyPulseState,
  createMemoryPulseStateStore,
  runPulseRunnerTick,
} from "../dist/index.js";

const pulse = {
  id: "weekly-demo-check",
  title: "Weekly demo check",
  active: true,
  schedule: {
    type: "weekly",
    daysOfWeek: ["sunday"],
    time: "09:00",
    timezone: "America/Los_Angeles",
  },
  notificationPolicy: {
    channels: ["sms"],
    repeatEveryMinutes: 30,
  },
};

const occurrence = {
  id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
  pulseId: "weekly-demo-check",
  dueAt: "2026-06-28T16:00:00.000Z",
  state: "due",
};

test("console adapter records expected payload", async () => {
  const lines = [];
  const adapter = createConsoleNotificationAdapter({
    write(line) {
      lines.push(line);
    },
  });

  const result = await adapter.send({
    channel: "console",
    pulse,
    occurrence,
    now: new Date("2026-06-28T16:00:00.000Z"),
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Weekly demo check/);
  assert.match(lines[0], /2026-06-28T16:00:00.000Z/);
});

test("twilio sms adapter sends through a safe mocked transport", async () => {
  const messages = [];
  const adapter = createTwilioSmsNotificationAdapter({
    from: "+15551234567",
    to: "+15557654321",
    transport: {
      async sendSms(message) {
        messages.push(message);
        return { id: "SM00000000000000000000000000000000" };
      },
    },
  });

  const result = await adapter.send({
    channel: "sms",
    pulse,
    occurrence,
    now: new Date("2026-06-28T16:00:00.000Z"),
  });

  assert.deepEqual(result, { ok: true, detail: "SM00000000000000000000000000000000" });
  assert.equal(messages[0].from, "+15551234567");
  assert.equal(messages[0].to, "+15557654321");
  assert.match(messages[0].body, /Pulse due: Weekly demo check/);
  assert.match(messages[0].body, /Mark Done to stop reminders/);
});

test("adapter failures are recorded and retried according to policy", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(occurrence);
  const store = createMemoryPulseStateStore(state);
  let attempts = 0;
  const adapter = createTwilioSmsNotificationAdapter({
    from: "+15551234567",
    to: "+15557654321",
    transport: {
      async sendSms() {
        attempts += 1;
        throw new Error("twilio unavailable");
      },
    },
  });

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:00:00.000Z"),
    pulses: [pulse],
    stateStore: store,
    notifier: adapter,
  });
  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:29:59.999Z"),
    pulses: [pulse],
    stateStore: store,
    notifier: adapter,
  });
  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:30:00.000Z"),
    pulses: [pulse],
    stateStore: store,
    notifier: adapter,
  });

  const events = store.read().events.filter((event) => event.type === "notification_sent");
  assert.equal(attempts, 2);
  assert.equal(events.length, 2);
  assert.equal(events[0].metadata.ok, false);
  assert.equal(events[0].metadata.detail, "twilio unavailable");
});

test("runner redacts configured twilio secrets from failed notification details", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(occurrence);
  const store = createMemoryPulseStateStore(state);
  const adapter = createTwilioSmsNotificationAdapter({
    from: "+15551234567",
    to: "+15557654321",
    transport: {
      async sendSms() {
        throw new Error("auth failed for super-secret-token");
      },
    },
  });

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:00:00.000Z"),
    pulses: [pulse],
    stateStore: store,
    notifier: adapter,
    redactValues: ["super-secret-token"],
  });

  const event = store.read().events.find((candidate) => candidate.type === "notification_sent");
  assert.equal(event.metadata.ok, false);
  assert.equal(event.metadata.detail.includes("super-secret-token"), false);
  assert.match(event.metadata.detail, /\[redacted\]/);
});

test("twilio sms transport posts form encoded message without leaking auth token in result", async () => {
  const requests = [];
  const transport = createTwilioSmsTransport({
    accountSid: "AC00000000000000000000000000000000",
    authToken: "super-secret-token",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 201,
        async json() {
          return { sid: "SM00000000000000000000000000000000" };
        },
      };
    },
  });

  const result = await transport.sendSms({
    from: "+15551234567",
    to: "+15557654321",
    body: "Done turns this off.",
  });
  const body = new URLSearchParams(requests[0].init.body);

  assert.deepEqual(result, { id: "SM00000000000000000000000000000000" });
  assert.equal(
    requests[0].url,
    "https://api.twilio.com/2010-04-01/Accounts/AC00000000000000000000000000000000/Messages.json",
  );
  assert.equal(requests[0].init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.match(requests[0].init.headers.authorization, /^Basic /);
  assert.equal(body.get("From"), "+15551234567");
  assert.equal(body.get("To"), "+15557654321");
  assert.equal(body.get("Body"), "Done turns this off.");
  assert.equal(JSON.stringify(result).includes("super-secret-token"), false);
});

test("runner environment can construct a twilio sms notification adapter", async () => {
  const requests = [];
  const adapter = createNotificationDispatcherFromEnv(
    {
      PULSE_NOTIFICATION_CHANNEL: "sms",
      PULSE_TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
      PULSE_TWILIO_AUTH_TOKEN: "super-secret-token",
      PULSE_TWILIO_FROM: "+15551234567",
      PULSE_SMS_TO: "+15557654321",
    },
    {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 201,
          async json() {
            return { sid: "SM00000000000000000000000000000000" };
          },
        };
      },
    },
  );

  const result = await adapter.send({
    channel: "sms",
    pulse,
    occurrence,
    now: new Date("2026-06-28T16:00:00.000Z"),
  });

  assert.deepEqual(result, { ok: true, detail: "SM00000000000000000000000000000000" });
  assert.equal(requests.length, 1);
});
