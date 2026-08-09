import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createNotificationDispatcherFromEnv,
  createConsoleNotificationAdapter,
  createNtfyNotificationAdapter,
  createEmptyPulseState,
  createMemoryPulseStateStore,
  runPulseRunnerTick,
  notificationActionOccurrenceId,
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
    channels: ["ntfy"],
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

test("ntfy adapter sends a private topic notification with the due state", async () => {
  const requests = [];
  const adapter = createNtfyNotificationAdapter({
    topic: "private-pulse-topic",
    token: "private-token",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  });

  const result = await adapter.send({
    channel: "ntfy",
    pulse,
    occurrence,
    now: new Date("2026-06-28T16:00:00.000Z"),
  });

  assert.deepEqual(result, { ok: true, detail: "sent" });
  assert.equal(requests[0].url, "https://ntfy.sh/private-pulse-topic");
  assert.equal(requests[0].init.headers.authorization, "Bearer private-token");
  assert.equal(requests[0].init.headers.title, "Pulse: Weekly demo check");
  assert.equal(requests[0].init.headers.priority, "high");
  assert.match(requests[0].init.body, /Mark Done to stop reminders/);
});

test("ntfy due notifications include one-tap Done and Snooze actions when configured", async () => {
  const requests = [];
  const adapter = createNtfyNotificationAdapter({
    topic: "private-pulse-topic",
    doneActionUrl: async (input) => `https://pulse.example.test/api/v1/notification-actions/${encodeURIComponent(input.occurrence.id)}/done?token=one-time-proof`,
    snoozeActionUrl: async (input) => `https://pulse.example.test/api/v1/notification-actions/${encodeURIComponent(input.occurrence.id)}/snooze?token=snooze-proof`,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  });

  await adapter.send({ channel: "ntfy", pulse, occurrence, now: new Date("2026-06-28T16:00:00.000Z") });

  assert.equal(
    requests[0].init.headers.actions,
    "http, Mark done, https://pulse.example.test/api/v1/notification-actions/weekly-demo-check%3A2026-06-28T16%3A00%3A00.000Z/done?token=one-time-proof, method=POST, clear=true; http, Snooze 30 min, https://pulse.example.test/api/v1/notification-actions/weekly-demo-check%3A2026-06-28T16%3A00%3A00.000Z/snooze?token=snooze-proof, method=POST, clear=true",
  );
});

test("ntfy Snooze action label reflects the pulse-specific duration", async () => {
  const requests = [];
  const adapter = createNtfyNotificationAdapter({
    topic: "private-pulse-topic",
    doneActionUrl: async () => "https://pulse.example.test/done",
    snoozeActionUrl: async () => "https://pulse.example.test/snooze",
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200 }; },
  });

  await adapter.send({
    channel: "ntfy",
    pulse: { ...pulse, notificationPolicy: { ...pulse.notificationPolicy, snoozeEveryMinutes: 1440 } },
    occurrence,
    now: new Date("2026-06-28T16:00:00.000Z"),
  });

  assert.match(requests[0].init.headers.actions, /Snooze 1 day/);
});

test("notification action routes decode the occurrence ID before signature verification", () => {
  assert.equal(
    notificationActionOccurrenceId("weekly-demo-check%3A2026-06-28T16%3A00%3A00.000Z"),
    "weekly-demo-check:2026-06-28T16:00:00.000Z",
  );
});

test("adapter failures are recorded and retried according to policy", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(occurrence);
  const store = createMemoryPulseStateStore(state);
  let attempts = 0;
  const adapter = createNtfyNotificationAdapter({
    topic: "private-pulse-topic",
    fetch: async () => {
      attempts += 1;
      throw new Error("ntfy unavailable");
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
  assert.equal(events[0].metadata.detail, "ntfy unavailable");
});

test("runner redacts configured ntfy tokens and topics from failed notification details", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(occurrence);
  const store = createMemoryPulseStateStore(state);
  const adapter = createNtfyNotificationAdapter({
    topic: "private-pulse-topic",
    token: "super-secret-token",
    fetch: async () => {
      throw new Error("auth failed for super-secret-token at https://ntfy.sh/private-pulse-topic");
    },
  });

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:00:00.000Z"),
    pulses: [pulse],
    stateStore: store,
    notifier: adapter,
    redactValues: ["super-secret-token", "private-pulse-topic"],
  });

  const event = store.read().events.find((candidate) => candidate.type === "notification_sent");
  assert.equal(event.metadata.ok, false);
  assert.equal(event.metadata.detail.includes("super-secret-token"), false);
  assert.equal(event.metadata.detail.includes("private-pulse-topic"), false);
  assert.match(event.metadata.detail, /\[redacted\]/);
});

test("runner environment requires an ntfy topic and constructs the ntfy adapter", async () => {
  const requests = [];
  const adapter = createNotificationDispatcherFromEnv(
    {
      PULSE_NOTIFY_PROVIDER: "ntfy",
      PULSE_NTFY_TOPIC: "private-pulse-topic",
      PULSE_NTFY_TOKEN: "super-secret-token",
    },
    {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
        };
      },
    },
  );

  const result = await adapter.send({
    channel: "ntfy",
    pulse,
    occurrence,
    now: new Date("2026-06-28T16:00:00.000Z"),
  });

  assert.deepEqual(result, { ok: true, detail: "sent" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.authorization, "Bearer super-secret-token");
});

test("ntfy config errors name the missing private setting", () => {
  assert.throws(
    () => createNotificationDispatcherFromEnv({ PULSE_NOTIFY_PROVIDER: "ntfy" }),
    /PULSE_NTFY_TOPIC/,
  );
});
