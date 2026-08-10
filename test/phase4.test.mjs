import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  applyOccurrenceAction,
  createEmptyPulseState,
  createMemoryPulseStateStore,
  createPollingRunner,
  readPulseRunnerHealth,
  runPulseRunnerTick,
  writePulseRunnerHeartbeat,
} from "../dist/index.js";

test("runner heartbeat reports running, stale, and missing states", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-health-"));
  const path = join(dir, "runner-health.json");
  const now = new Date("2026-08-04T12:00:00.000Z");
  try {
    assert.equal(readPulseRunnerHealth(path, now, 120_000).status, "unknown");
    writePulseRunnerHeartbeat(path, new Date("2026-08-04T11:59:00.000Z"));
    assert.equal(readPulseRunnerHealth(path, now, 120_000).status, "running");
    assert.equal(readPulseRunnerHealth(path, new Date("2026-08-04T12:03:01.000Z"), 120_000).status, "stale");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const weeklyPulse = {
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
    channels: ["console"],
    repeatEveryMinutes: 30,
  },
};

function createFakeNotifier() {
  const sends = [];
  return {
    sends,
    async send(input) {
      sends.push(input);
      return { ok: true };
    },
  };
}

test("runner sends when a scheduled occurrence becomes due", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "scheduled",
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  const restored = store.read();
  assert.equal(restored.occurrences[0].state, "due");
  assert.equal(notifier.sends.length, 1);
  assert.equal(notifier.sends[0].channel, "console");
  assert.equal(restored.events.some((event) => event.type === "occurrence_became_due"), true);
  assert.equal(restored.events.some((event) => event.type === "notification_sent"), true);
});

test("runner automatically snoozes an unanswered notification after two minutes and notifies again after thirty", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "due",
  });
  state.events.push({
    id: "evt:weekly-demo-check:2026-06-28T16:00:00.000Z:notification_sent:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    type: "notification_sent",
    at: "2026-06-28T16:00:00.000Z",
    metadata: { channel: "console" },
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:02:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  const automaticallySnoozed = store.read().occurrences[0];
  assert.equal(notifier.sends.length, 0);
  assert.equal(automaticallySnoozed.state, "scheduled");
  assert.equal(automaticallySnoozed.dueAt, "2026-06-28T16:32:00.000Z");
  assert.equal(automaticallySnoozed.snoozeCount, 1);
  assert.equal(store.read().events.at(-1)?.metadata?.source, "automatic-no-action");

  const completedDuringAutomaticSnooze = applyOccurrenceAction(automaticallySnoozed, {
    type: "done",
    at: new Date("2026-06-28T16:05:00.000Z"),
  });
  assert.equal(completedDuringAutomaticSnooze.state, "done");
  assert.equal(completedDuringAutomaticSnooze.completedAt, "2026-06-28T16:05:00.000Z");

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:32:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 1);
  assert.equal(store.read().occurrences[0].state, "due");
  assert.equal(store.read().events.filter((event) => event.type === "notification_sent").length, 2);
});

test("runner sends immediately when a snoozed occurrence becomes due again", async () => {
  const state = createEmptyPulseState();
  const occurrenceId = "weekly-demo-check:2026-06-28T16:00:00.000Z";
  state.occurrences.push({
    id: occurrenceId,
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:32:00.000Z",
    state: "scheduled",
    snoozedAt: "2026-06-28T16:02:00.000Z",
    snoozeCount: 1,
  });
  state.events.push(
    {
      id: "evt:first-due",
      pulseId: "weekly-demo-check",
      occurrenceId,
      type: "occurrence_became_due",
      at: "2026-06-28T16:00:00.000Z",
    },
    {
      id: "evt:first-send",
      pulseId: "weekly-demo-check",
      occurrenceId,
      type: "notification_sent",
      at: "2026-06-28T16:00:00.000Z",
      metadata: { channel: "console", ok: true },
    },
    {
      id: "evt:first-snooze",
      pulseId: "weekly-demo-check",
      occurrenceId,
      type: "occurrence_snoozed",
      at: "2026-06-28T16:02:00.000Z",
      metadata: { until: "2026-06-28T16:32:00.000Z", source: "notification-action" },
    },
  );
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:32:00.000Z"),
    pulses: [{ ...weeklyPulse, notificationPolicy: { ...weeklyPulse.notificationPolicy, repeatEveryMinutes: 60 } }],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 1);
  assert.equal(store.read().occurrences[0].state, "due");
  assert.equal(store.read().events.at(-1)?.type, "notification_sent");
  assert.equal(store.read().events.filter((event) => event.type === "notification_sent").length, 2);
});

test("runner honors a pulse-specific unattended snooze duration", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "due",
  });
  state.events.push({
    id: "evt:weekly-demo-check:notification_sent:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    type: "notification_sent",
    at: "2026-06-28T16:00:00.000Z",
    metadata: { channel: "console", ok: true },
  });
  const store = createMemoryPulseStateStore(state);

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:02:00.000Z"),
    pulses: [{ ...weeklyPulse, notificationPolicy: { ...weeklyPulse.notificationPolicy, snoozeEveryMinutes: 1440 } }],
    stateStore: store,
    notifier: createFakeNotifier(),
  });

  assert.equal(store.read().occurrences[0].dueAt, "2026-06-29T16:02:00.000Z");
});

test("runner stops notifications after Done", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "done",
    completedAt: "2026-06-28T16:07:00.000Z",
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:30:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 0);
});

test("runner retries a failed delivery after a fixed five minutes", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "due",
  });
  state.events.push({
    id: "evt:weekly-demo-check:2026-06-28T16:00:00.000Z:notification_sent:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    type: "notification_sent",
    at: "2026-06-28T16:00:00.000Z",
    metadata: { channel: "console", ok: false },
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:04:59.999Z"),
    pulses: [{ ...weeklyPulse, notificationPolicy: { ...weeklyPulse.notificationPolicy, repeatEveryMinutes: 1440 } }],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 0);
  assert.equal(store.read().events.filter((event) => event.type === "notification_sent").length, 1);

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:05:00.000Z"),
    pulses: [{ ...weeklyPulse, notificationPolicy: { ...weeklyPulse.notificationPolicy, repeatEveryMinutes: 1440 } }],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 1, "per-pulse values must not delay the system delivery retry");
  assert.equal(store.read().events.filter((event) => event.type === "notification_sent").length, 2);
});

test("runner catches overdue scheduled occurrences after downtime", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "scheduled",
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-29T16:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  assert.equal(store.read().occurrences[0].state, "due");
  assert.equal(notifier.sends.length, 1);
});

test("runner creates and notifies a missed occurrence after empty-state downtime", async () => {
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T17:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  const restored = store.read();
  assert.equal(restored.occurrences[0].id, "weekly-demo-check:2026-06-28T16:00:00.000Z");
  assert.equal(restored.occurrences[0].state, "due");
  assert.equal(notifier.sends.length, 1);
});

test("runner creates the next missed occurrence after prior completion history", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-21T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-21T16:00:00.000Z",
    state: "done",
    completedAt: "2026-06-21T16:05:00.000Z",
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({
    now: new Date("2026-06-28T17:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  const restored = store.read();
  assert.equal(restored.occurrences[1].id, "weekly-demo-check:2026-06-28T16:00:00.000Z");
  assert.equal(restored.occurrences[1].state, "due");
  assert.equal(notifier.sends.length, 1);
});

test("runner keeps exactly one open occurrence for a recurring pulse", async () => {
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  const notifier = createFakeNotifier();

  await runPulseRunnerTick({ now: new Date("2026-08-05T20:00:00.000Z"), pulses: [weeklyPulse], stateStore: store, notifier });
  await runPulseRunnerTick({ now: new Date("2026-08-05T20:01:00.000Z"), pulses: [weeklyPulse], stateStore: store, notifier });

  assert.equal(store.read().occurrences.filter((occurrence) => occurrence.state !== "done").length, 1);
});

test("runner reconciles an untouched future occurrence after its weekly schedule changes", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-08-16T16:50:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-08-16T16:50:00.000Z",
    state: "scheduled",
  });
  const store = createMemoryPulseStateStore(state);

  await runPulseRunnerTick({
    now: new Date("2026-08-09T23:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier: createFakeNotifier(),
  });

  const restored = store.read();
  assert.equal(restored.occurrences[0].id, "weekly-demo-check:2026-08-16T16:00:00.000Z");
  assert.equal(restored.occurrences[0].dueAt, "2026-08-16T16:00:00.000Z");
  assert.equal(restored.events.at(-1)?.type, "occurrence_scheduled");
  assert.equal(restored.events.at(-1)?.metadata?.rescheduledFrom, "2026-08-16T16:50:00.000Z");
});

test("runner preserves a snoozed future occurrence when its definition changes", async () => {
  const snoozed = {
    id: "weekly-demo-check:2026-08-16T16:50:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-08-16T16:50:00.000Z",
    state: "scheduled",
    snoozedAt: "2026-08-09T23:00:00.000Z",
    snoozeCount: 1,
  };
  const state = createEmptyPulseState();
  state.occurrences.push(snoozed);
  const store = createMemoryPulseStateStore(state);

  await runPulseRunnerTick({
    now: new Date("2026-08-09T23:01:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier: createFakeNotifier(),
  });

  assert.deepEqual(store.read().occurrences[0], snoozed);
  assert.equal(store.read().events.length, 0);
});

test("runner self-heals stale future open occurrences by retaining the earliest", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(
    { id: "weekly-demo-check:2026-08-09T16:00:00.000Z", pulseId: "weekly-demo-check", dueAt: "2026-08-09T16:00:00.000Z", state: "scheduled" },
    { id: "weekly-demo-check:2026-08-16T16:00:00.000Z", pulseId: "weekly-demo-check", dueAt: "2026-08-16T16:00:00.000Z", state: "scheduled" },
  );
  const store = createMemoryPulseStateStore(state);

  await runPulseRunnerTick({ now: new Date("2026-08-05T20:00:00.000Z"), pulses: [weeklyPulse], stateStore: store, notifier: createFakeNotifier() });

  assert.deepEqual(store.read().occurrences.map((occurrence) => occurrence.id), ["weekly-demo-check:2026-08-09T16:00:00.000Z"]);
});

test("runner logs failed notification attempts and persists due state", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "scheduled",
  });
  const store = createMemoryPulseStateStore(state);

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier: {
      send() {
        throw new Error("network down");
      },
    },
  });

  const restored = store.read();
  const notificationEvent = restored.events.find((event) => event.type === "notification_sent");
  assert.equal(restored.occurrences[0].state, "due");
  assert.equal(notificationEvent?.metadata?.ok, false);
  assert.equal(notificationEvent?.metadata?.detail, "network down");
});

test("polling runner can start, tick, and stop", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "due",
  });
  const store = createMemoryPulseStateStore(state);
  const notifier = createFakeNotifier();
  const runner = createPollingRunner({
    now: () => new Date("2026-06-28T16:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
    intervalMs: 5,
  });

  runner.start();
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  runner.stop();
  const sendsAfterStop = notifier.sends.length;
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

  assert.equal(sendsAfterStop, 1);
  assert.equal(notifier.sends.length, sendsAfterStop);
});
