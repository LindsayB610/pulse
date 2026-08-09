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
  isPulseNtfySequenceId,
  ntfySequenceIdForOccurrence,
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

  assert.equal(result.ok, true);
  assert.equal(result.detail, "sent");
  assert.match(result.sequenceId, /^pulse-[A-Za-z0-9_-]+$/);
  assert.match(requests[0].url, /^https:\/\/ntfy\.sh\/private-pulse-topic\/pulse-[A-Za-z0-9_-]+$/);
  assert.equal(requests[0].init.headers.authorization, "Bearer private-token");
  assert.equal(requests[0].init.headers.title, "Pulse: Weekly demo check");
  assert.equal(requests[0].init.headers.priority, "high");
  assert.match(requests[0].init.body, /Mark Done to stop reminders/);
});

test("ntfy uses one isolated sequence for an occurrence and deletes only that sequence", async () => {
  const requests = [];
  const adapter = createNtfyNotificationAdapter({
    topic: "private-pulse-topic",
    token: "private-token",
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200 }; },
  });
  const otherOccurrence = { ...occurrence, id: "weekly-demo-check:2026-07-05T16:00:00.000Z", dueAt: "2026-07-05T16:00:00.000Z" };

  await adapter.send({ channel: "ntfy", pulse, occurrence, now: new Date("2026-06-28T16:00:00.000Z") });
  await adapter.send({ channel: "ntfy", pulse, occurrence: { ...occurrence, snoozeCount: 1 }, now: new Date("2026-06-28T16:30:00.000Z") });
  await adapter.send({ channel: "ntfy", pulse, occurrence: otherOccurrence, now: new Date("2026-07-05T16:00:00.000Z") });

  assert.equal(requests[0].url, requests[1].url, "snoozes must update the original occurrence sequence");
  assert.notEqual(requests[0].url, requests[2].url, "another occurrence must have its own sequence");
  assert.equal(typeof adapter.deleteOccurrenceSequence, "function");
  const persistedSequenceId = requests[0].url.split("/").at(-1);
  await adapter.deleteOccurrenceSequence({ occurrence, sequenceId: persistedSequenceId, now: new Date("2026-06-28T16:31:00.000Z") });
  assert.deepEqual(requests[3], {
    url: requests[0].url,
    init: {
      method: "DELETE",
      headers: { authorization: "Bearer private-token" },
      body: "",
    },
  });
  await assert.rejects(
    adapter.deleteOccurrenceSequence({ occurrence, sequenceId: "", now: new Date("2026-06-28T16:32:00.000Z") }),
    /valid Pulse ntfy sequence ID/,
  );
  assert.equal(requests.length, 4, "invalid IDs must fail before any DELETE request");
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

  assert.equal(result.ok, true);
  assert.equal(result.detail, "sent");
  assert.match(result.sequenceId, /^pulse-[A-Za-z0-9_-]+$/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.authorization, "Bearer super-secret-token");
});

test("ntfy config errors name the missing private setting", () => {
  assert.throws(
    () => createNotificationDispatcherFromEnv({ PULSE_NOTIFY_PROVIDER: "ntfy" }),
    /PULSE_NTFY_TOPIC/,
  );
});

test("runner retries failed sequence cleanup without touching legacy unsequenced history", async () => {
  const sequenceId = ntfySequenceIdForOccurrence(occurrence.id);
  assert.match(sequenceId, /^pulse-[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(sequenceId, /weekly|2026/);
  assert.equal(ntfySequenceIdForOccurrence(occurrence.id), sequenceId, "sequence IDs must be deterministic");
  assert.notEqual(ntfySequenceIdForOccurrence(`${occurrence.id}-other`), sequenceId, "occurrences must not share sequences");
  assert.throws(() => ntfySequenceIdForOccurrence("   "), /occurrence ID is required/);
  assert.equal(isPulseNtfySequenceId(sequenceId), true);
  assert.equal(isPulseNtfySequenceId(""), false);
  assert.equal(isPulseNtfySequenceId("pulse-corrupt"), false);
  const doneOccurrence = { ...occurrence, state: "done", completedAt: "2026-06-28T16:05:00.000Z" };
  const legacyOccurrence = { ...doneOccurrence, id: "legacy:2026-06-21T16:00:00.000Z", dueAt: "2026-06-21T16:00:00.000Z" };
  const corruptOccurrence = { ...doneOccurrence, id: "corrupt:2026-06-14T16:00:00.000Z", dueAt: "2026-06-14T16:00:00.000Z" };
  const state = createEmptyPulseState();
  state.occurrences.push(doneOccurrence, legacyOccurrence, corruptOccurrence);
  state.events.push(
    { id: "sent-sequenced", pulseId: pulse.id, occurrenceId: doneOccurrence.id, type: "notification_sent", at: "2026-06-28T16:00:00.000Z", metadata: { channel: "ntfy", ok: true, sequenceId } },
    { id: "sent-legacy", pulseId: pulse.id, occurrenceId: legacyOccurrence.id, type: "notification_sent", at: "2026-06-21T16:00:00.000Z", metadata: { channel: "ntfy", ok: true } },
    { id: "sent-corrupt", pulseId: pulse.id, occurrenceId: corruptOccurrence.id, type: "notification_sent", at: "2026-06-14T16:00:00.000Z", metadata: { channel: "ntfy", ok: true, sequenceId: "" } },
  );
  const store = createMemoryPulseStateStore(state);
  let attempts = 0;
  const notifier = {
    send: async () => ({ ok: true }),
    deleteOccurrenceSequence: async ({ occurrence: target, sequenceId: targetSequenceId }) => {
      assert.equal(target.id, doneOccurrence.id, "legacy or corrupt notifications are never guessed into a sequence");
      assert.equal(targetSequenceId, sequenceId, "cleanup must use the sequence persisted at delivery time");
      attempts += 1;
      if (attempts === 1) throw new Error("cleanup failed for private-token");
      return { ok: true, detail: "deleted", sequenceId };
    },
  };

  const failed = await runPulseRunnerTick({ now: new Date("2026-06-28T16:10:00.000Z"), pulses: [], stateStore: store, notifier, redactValues: ["private-token"] });
  assert.equal(failed.notificationSequenceDeleteFailures, 1);
  assert.equal(attempts, 1);
  const failureEvent = store.read().events.find((event) => event.type === "notification_sequence_cleanup");
  assert.equal(failureEvent.metadata.ok, false);
  assert.equal(failureEvent.metadata.detail, "cleanup failed for [redacted]");

  await runPulseRunnerTick({ now: new Date("2026-06-28T16:14:59.999Z"), pulses: [], stateStore: store, notifier });
  assert.equal(attempts, 1, "cleanup retry is throttled for five minutes");
  const retried = await runPulseRunnerTick({ now: new Date("2026-06-28T16:15:00.000Z"), pulses: [], stateStore: store, notifier });
  assert.equal(retried.notificationSequencesDeleted, 1);
  assert.equal(attempts, 2);
  await runPulseRunnerTick({ now: new Date("2026-06-28T16:20:00.000Z"), pulses: [], stateStore: store, notifier });
  assert.equal(attempts, 2, "successful deletion is idempotent");
});
