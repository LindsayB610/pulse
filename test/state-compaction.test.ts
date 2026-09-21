import assert from "node:assert/strict";
import { test } from "node:test";

import type { PulseDefinition, PulseEvent, PulseOccurrence } from "../src/model.js";
import { runPulseRunnerTick } from "../src/runner.js";
import { createEmptyPulseState, createMemoryPulseStateStore } from "../src/storage.js";

const activeOccurrence: PulseOccurrence = {
  id: "medicine:s1:2026-09-21T16:00:00.000Z",
  pulseId: "medicine",
  dueAt: "2026-09-21T16:00:00.000Z",
  state: "due",
  seriesRevision: 1,
  ordinal: 1,
  titleSnapshot: "Take medicine",
};

const pulse: PulseDefinition = {
  id: "medicine",
  title: "Take medicine",
  active: true,
  definitionRevision: 1,
  seriesRevision: 1,
  schedule: {
    version: 2,
    type: "once",
    date: "2026-09-21",
    time: "16:00",
    timezone: "UTC",
  },
  notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
};

function event(input: Partial<PulseEvent> & Pick<PulseEvent, "id" | "type" | "at">): PulseEvent {
  return {
    pulseId: "medicine",
    occurrenceId: activeOccurrence.id,
    ...input,
  };
}

test("persisting state collapses an equivalent delivery-failure storm to its latest retry evidence", () => {
  const state = createEmptyPulseState();
  state.occurrences.push(activeOccurrence);
  for (let index = 0; index < 2_000; index += 1) {
    state.events.push(event({
      id: `failure-${index}`,
      type: "notification_sent",
      at: new Date(Date.UTC(2026, 8, 21, 0, index)).toISOString(),
      metadata: { channel: "ntfy", ok: false, detail: "ntfy rejected the same header" },
    }));
  }
  state.events.push(
    event({ id: "stale-appended-late", type: "notification_sent", at: "2026-09-01T00:00:00.000Z", metadata: { channel: "ntfy", ok: false, detail: "stale fixture ordering" } }),
    event({ id: "scheduled", type: "occurrence_scheduled", at: "2026-09-20T16:00:00.000Z" }),
    event({ id: "due", type: "occurrence_became_due", at: "2026-09-21T16:00:00.000Z" }),
    event({ id: "snooze-1", type: "occurrence_snoozed", at: "2026-09-21T16:02:00.000Z" }),
    event({ id: "snooze-2", type: "occurrence_snoozed", at: "2026-09-21T16:32:00.000Z" }),
  );

  const store = createMemoryPulseStateStore();
  store.write(state);
  const persisted = store.read();
  const failures = persisted.events.filter((candidate) => candidate.type === "notification_sent" && candidate.metadata?.ok === false);

  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.id, "failure-1999");
  assert.deepEqual(
    persisted.events.filter((candidate) => candidate.type === "occurrence_snoozed").map((candidate) => candidate.id),
    ["snooze-1", "snooze-2"],
    "snooze events remain individually countable for completion history",
  );
  assert.equal(persisted.events.some((candidate) => candidate.id === "scheduled"), true);
  assert.equal(persisted.events.some((candidate) => candidate.id === "due"), true);
});

test("compaction keeps independent pulse-level history and notification channels", () => {
  const state = createEmptyPulseState();
  state.occurrences.push(activeOccurrence);
  state.events.push(
    { id: "created-medicine", pulseId: "medicine", type: "pulse_created", at: "2026-09-01T00:00:00.000Z" },
    { id: "created-homework", pulseId: "homework", type: "pulse_created", at: "2026-09-02T00:00:00.000Z" },
    event({ id: "ntfy-failure", type: "notification_sent", at: "2026-09-21T16:00:00.000Z", metadata: { channel: "ntfy", ok: false } }),
    event({ id: "console-failure", type: "notification_sent", at: "2026-09-21T16:00:00.000Z", metadata: { channel: "console", ok: false } }),
  );

  const store = createMemoryPulseStateStore();
  store.write(state);
  const persisted = store.read();

  assert.deepEqual(
    persisted.events.filter((candidate) => candidate.type === "pulse_created").map((candidate) => candidate.id),
    ["created-medicine", "created-homework"],
  );
  assert.deepEqual(
    persisted.events.filter((candidate) => candidate.type === "notification_sent").map((candidate) => candidate.id),
    ["ntfy-failure", "console-failure"],
  );
});

test("compacted retry evidence still enforces the five-minute delivery interval", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(activeOccurrence);
  for (let index = 0; index < 2_000; index += 1) {
    state.events.push(event({
      id: `failure-${index}`,
      type: "notification_sent",
      at: new Date(Date.parse("2026-09-21T15:59:58.001Z") + index).toISOString(),
      metadata: { channel: "ntfy", ok: false, detail: "same failure" },
    }));
  }
  const store = createMemoryPulseStateStore();
  store.write(state);
  let sends = 0;
  const notifier = { send: () => { sends += 1; return { ok: false, detail: "same failure" }; } };

  await runPulseRunnerTick({
    now: new Date("2026-09-21T16:04:59.999Z"),
    pulses: [pulse],
    stateStore: store,
    notifier,
  });
  assert.equal(sends, 0);

  await runPulseRunnerTick({
    now: new Date("2026-09-21T16:05:00.000Z"),
    pulses: [pulse],
    stateStore: store,
    notifier,
  });
  assert.equal(sends, 1);
  assert.equal(store.read().events.filter((candidate) => candidate.type === "notification_sent" && candidate.metadata?.ok === false).length, 1);
});

test("compaction preserves successful delivery and cleanup evidence separately from failures", () => {
  const sequenceId = "pulse-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";
  const state = createEmptyPulseState();
  state.occurrences.push({ ...activeOccurrence, state: "done", completedAt: "2026-09-21T16:03:00.000Z" });
  state.events.push(
    event({ id: "send-failed", type: "notification_sent", at: "2026-09-21T16:00:00.000Z", metadata: { channel: "ntfy", ok: false, detail: "down" } }),
    event({ id: "send-ok", type: "notification_sent", at: "2026-09-21T16:01:00.000Z", metadata: { channel: "ntfy", ok: true, sequenceId } }),
    event({ id: "cleanup-failed", type: "notification_sequence_cleanup", at: "2026-09-21T16:04:00.000Z", metadata: { channel: "ntfy", ok: false, sequenceId, detail: "down" } }),
    event({ id: "cleanup-ok", type: "notification_sequence_cleanup", at: "2026-09-21T16:05:00.000Z", metadata: { channel: "ntfy", ok: true, sequenceId } }),
    event({ id: "done", type: "occurrence_completed", at: "2026-09-21T16:03:00.000Z" }),
  );

  const store = createMemoryPulseStateStore();
  store.write(state);
  const persisted = store.read();

  assert.equal(persisted.events.some((candidate) => candidate.id === "send-ok"), true);
  assert.equal(persisted.events.some((candidate) => candidate.id === "cleanup-ok"), true);
  assert.equal(persisted.events.some((candidate) => candidate.id === "done"), true);
});

test("legacy sends without an ok flag remain successful evidence beside a later explicit failure", async () => {
  const state = createEmptyPulseState();
  state.occurrences.push(activeOccurrence);
  state.events.push(
    event({ id: "legacy-success", type: "notification_sent", at: "2026-09-21T16:00:00.000Z", metadata: { channel: "ntfy" } }),
    event({ id: "later-failure", type: "notification_sent", at: "2026-09-21T16:01:00.000Z", metadata: { channel: "ntfy", ok: false, detail: "temporary failure" } }),
  );
  const store = createMemoryPulseStateStore(state);
  const sends: unknown[] = [];

  await runPulseRunnerTick({
    now: new Date("2026-09-21T16:02:00.000Z"),
    pulses: [pulse],
    stateStore: store,
    notifier: { send: (input) => { sends.push(input); return { ok: true }; } },
  });

  const persisted = store.read();
  assert.deepEqual(
    persisted.events.filter((candidate) => candidate.type === "notification_sent").map((candidate) => candidate.id),
    ["legacy-success", "later-failure"],
    "legacy success cannot be compacted into the later failure bucket",
  );
  assert.equal(persisted.occurrences[0]?.state, "scheduled", "the legacy success still drives the two-minute automatic snooze");
  assert.equal(persisted.occurrences[0]?.snoozeCount, 1);
  assert.equal(sends.length, 0);
});
