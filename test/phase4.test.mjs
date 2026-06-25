import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEmptyPulseState,
  createMemoryPulseStateStore,
  createPollingRunner,
  runPulseRunnerTick,
} from "../dist/index.js";

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

test("runner repeats notifications according to policy while still due", async () => {
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
    now: new Date("2026-06-28T16:30:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 1);
  assert.equal(store.read().events.filter((event) => event.type === "notification_sent").length, 2);
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

test("runner does not double-send inside the repeat interval", async () => {
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
    now: new Date("2026-06-28T16:29:59.999Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  assert.equal(notifier.sends.length, 0);
  assert.equal(store.read().events.filter((event) => event.type === "notification_sent").length, 1);
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
