import assert from "node:assert/strict";
import { test } from "node:test";

import { createNtfyNotificationAdapter } from "../src/adapters.js";
import { applyOccurrenceAction, type PulseDefinition } from "../src/model.js";
import { ntfySequenceIdForOccurrence } from "../src/ntfy-sequence.js";
import { runPulseRunnerTick } from "../src/runner.js";
import { createEmptyPulseState, createMemoryPulseStateStore } from "../src/storage.js";

function oncePulse(): PulseDefinition {
  return {
    id: "one-shot",
    title: "One shot",
    active: true,
    definitionRevision: 1,
    seriesRevision: 1,
    schedule: {
      version: 2,
      type: "once",
      date: "2026-08-28",
      time: "09:00",
      timezone: "UTC",
    },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
  };
}

function dailyPulse(count = 3): PulseDefinition {
  return {
    ...oncePulse(),
    id: "daily-series",
    title: "Daily series",
    schedule: {
      version: 2,
      type: "daily",
      interval: 1,
      startDate: "2026-08-28",
      time: "09:00",
      timezone: "UTC",
      end: { type: "count", occurrences: count },
    },
  };
}

function notifier() {
  const sends: Array<unknown> = [];
  return { sends, send(input: unknown) { sends.push(input); return { ok: true }; } };
}

test("Done permanently completes a one-time reminder", async () => {
  const pulse = oncePulse();
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  const fake = notifier();

  await runPulseRunnerTick({ now: new Date("2026-08-28T09:00:00.000Z"), pulses: [pulse], stateStore: store, notifier: fake });
  const due = store.read().occurrences[0]!;
  const completed = applyOccurrenceAction(due, { type: "done", at: new Date("2026-08-28T09:01:00.000Z") });
  const state = store.read();
  state.occurrences = [completed];
  store.write(state);

  await runPulseRunnerTick({ now: new Date("2026-09-28T09:00:00.000Z"), pulses: [pulse], stateStore: store, notifier: fake });
  assert.equal(store.read().occurrences.length, 1);
  assert.equal(store.read().occurrences[0]?.state, "done");
});

test("count-ending series opens one occurrence at a time and stops after final Done", async () => {
  const pulse = dailyPulse(2);
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  const fake = notifier();

  await runPulseRunnerTick({ now: new Date("2026-08-28T09:00:00.000Z"), pulses: [pulse], stateStore: store, notifier: fake });
  let state = store.read();
  assert.equal(state.occurrences.length, 1);
  assert.equal(state.occurrences[0]?.ordinal, 1);
  state.occurrences[0] = applyOccurrenceAction(state.occurrences[0]!, { type: "done", at: new Date("2026-08-28T09:01:00.000Z") });
  store.write(state);

  await runPulseRunnerTick({ now: new Date("2026-08-29T09:00:00.000Z"), pulses: [pulse], stateStore: store, notifier: fake });
  state = store.read();
  const final = state.occurrences.find((value) => value.state !== "done")!;
  assert.equal(final.ordinal, 2);
  assert.equal(final.final, true);
  state.occurrences = state.occurrences.map((value) => value.id === final.id
    ? applyOccurrenceAction(value, { type: "done", at: new Date("2026-08-29T09:01:00.000Z") })
    : value);
  store.write(state);

  await runPulseRunnerTick({ now: new Date("2026-08-30T09:00:00.000Z"), pulses: [pulse], stateStore: store, notifier: fake });
  assert.equal(store.read().occurrences.filter((value) => value.state !== "done").length, 0);
});

test("runner downtime produces one recent catch-up, never a backlog", async () => {
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  await runPulseRunnerTick({
    now: new Date("2026-09-15T12:00:00.000Z"),
    pulses: [dailyPulse(30)],
    stateStore: store,
    notifier: notifier(),
  });
  assert.deepEqual(store.read().occurrences.map((value) => value.dueAt), ["2026-09-15T09:00:00.000Z"]);
});

test("final notification language survives every follow-up in the same chain", async () => {
  const calls: Array<{ headers: Record<string, string>; body: string }> = [];
  const adapter = createNtfyNotificationAdapter({
    topic: "public-fixture-topic-with-thirty-two-characters",
    fetch: async (_url, init) => { calls.push({ headers: init.headers, body: init.body }); return { ok: true, status: 200 }; },
  });
  const pulse = dailyPulse(1);
  const occurrence = {
    id: "daily-series:s1:2026-08-28T09:00:00.000Z",
    pulseId: pulse.id,
    dueAt: "2026-08-28T09:00:00.000Z",
    state: "due" as const,
    seriesRevision: 1,
    ordinal: 1,
    final: true,
    titleSnapshot: pulse.title,
  };

  await adapter.send({ channel: "ntfy", pulse, occurrence, now: new Date("2026-08-28T09:00:00.000Z") });
  await adapter.send({ channel: "ntfy", pulse, occurrence: { ...occurrence, snoozeCount: 2 }, now: new Date("2026-08-28T10:00:00.000Z") });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.body.includes("Final reminder in this series")));
});

test("an open date-ending occurrence becomes final as later cadence slots expire", async () => {
  const pulse: PulseDefinition = {
    ...dailyPulse(),
    schedule: {
      version: 2,
      type: "daily",
      interval: 1,
      startDate: "2026-08-28",
      time: "09:00",
      timezone: "UTC",
      end: { type: "date", date: "2026-08-30" },
    },
  };
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "daily-series:s1:2026-08-28T09:00:00.000Z",
    pulseId: pulse.id,
    dueAt: "2026-08-28T09:00:00.000Z",
    state: "due",
    seriesRevision: 1,
    ordinal: 1,
    final: false,
    titleSnapshot: pulse.title,
  });
  const store = createMemoryPulseStateStore(state);
  await runPulseRunnerTick({ now: new Date("2026-08-31T12:00:00.000Z"), pulses: [pulse], stateStore: store, notifier: notifier() });
  assert.equal(store.read().occurrences[0]?.final, true);
});

test("runner drains durable notification cleanup work after a definition was deleted", async () => {
  const sequenceId = ntfySequenceIdForOccurrence("deleted-open");
  const state = createEmptyPulseState();
  state.pendingNotificationSequenceCleanups = [{
    pulseId: "deleted",
    occurrenceId: "deleted-open",
    sequenceId,
    requestedAt: "2026-08-28T09:01:00.000Z",
    titleSnapshot: "Deleted reminder",
  }];
  const store = createMemoryPulseStateStore(state);
  const deleted: Array<{ occurrenceId: string; sequenceId: string }> = [];
  const result = await runPulseRunnerTick({
    now: new Date("2026-08-28T09:05:00.000Z"),
    pulses: [],
    stateStore: store,
    notifier: {
      send: () => ({ ok: true }),
      deleteOccurrenceSequence: ({ occurrence, sequenceId: id }) => {
        deleted.push({ occurrenceId: occurrence.id, sequenceId: id });
        return { ok: true };
      },
    },
  });
  assert.deepEqual(deleted, [{ occurrenceId: "deleted-open", sequenceId }]);
  assert.equal(result.notificationSequencesDeleted, 1);
  assert.equal(store.read().pendingNotificationSequenceCleanups, undefined);
});

test("weekly, monthly, and yearly series each run due to Done to final to stop", async () => {
  const schedules = [
    { version: 2, type: "weekly", interval: 1, startDate: "2026-08-28", weekStartsOn: "monday", daysOfWeek: ["friday"], time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } },
    { version: 2, type: "monthly", interval: 1, startDate: "2026-08-28", rule: { type: "dayOfMonth", day: 28, missingDate: "skip" }, time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } },
    { version: 2, type: "yearly", interval: 1, startDate: "2026-08-28", month: 8, day: 28, missingDate: "skip", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } },
  ] as const;
  for (const [index, schedule] of schedules.entries()) {
    const pulse = { ...oncePulse(), id: `cadence-${index}`, title: `Cadence ${index}`, schedule } as PulseDefinition;
    const store = createMemoryPulseStateStore(createEmptyPulseState());
    const instants = schedule.type === "weekly"
      ? ["2026-08-28T09:00:00.000Z", "2026-09-04T09:00:00.000Z"]
      : schedule.type === "monthly"
        ? ["2026-08-28T09:00:00.000Z", "2026-09-28T09:00:00.000Z"]
        : ["2026-08-28T09:00:00.000Z", "2027-08-28T09:00:00.000Z"];
    await runPulseRunnerTick({ now: new Date(instants[0]), pulses: [pulse], stateStore: store, notifier: notifier() });
    let state = store.read();
    state.occurrences[0] = applyOccurrenceAction(state.occurrences[0]!, { type: "done", at: new Date(Date.parse(instants[0]) + 60_000) });
    store.write(state);
    await runPulseRunnerTick({ now: new Date(instants[1]), pulses: [pulse], stateStore: store, notifier: notifier() });
    state = store.read();
    const final = state.occurrences.find((occurrence) => occurrence.state !== "done")!;
    assert.equal(final.final, true, `${schedule.type} creates a final second occurrence`);
    state.occurrences = state.occurrences.map((occurrence) => occurrence.id === final.id ? applyOccurrenceAction(occurrence, { type: "done", at: new Date(Date.parse(instants[1]) + 60_000) }) : occurrence);
    store.write(state);
    await runPulseRunnerTick({ now: new Date(Date.parse(instants[1]) + 370 * 86_400_000), pulses: [pulse], stateStore: store, notifier: notifier() });
    assert.equal(store.read().occurrences.filter((occurrence) => occurrence.state !== "done").length, 0, `${schedule.type} stops`);
  }
});

test("pause suppresses future generation without silencing an already-due obligation", async () => {
  const paused = { ...dailyPulse(3), active: false };
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  const fake = notifier();
  await runPulseRunnerTick({ now: new Date("2026-08-28T09:00:00.000Z"), pulses: [paused], stateStore: store, notifier: fake });
  assert.equal(store.read().occurrences.length, 0);

  const active = { ...paused, active: true };
  await runPulseRunnerTick({ now: new Date("2026-08-29T09:00:00.000Z"), pulses: [active], stateStore: store, notifier: fake });
  const due = store.read().occurrences[0]!;
  assert.equal(due.ordinal, 1, "elapsed cadence while paused does not consume an occurrence");
  await runPulseRunnerTick({ now: new Date("2026-08-29T09:01:00.000Z"), pulses: [{ ...active, active: false }], stateStore: store, notifier: fake });
  assert.equal(store.read().occurrences[0]?.state, "due", "pausing does not turn active phone work into an acknowledgement escape hatch");
});

test("count-series notification copy warns at three and two remaining before final", async () => {
  const bodies: string[] = [];
  const adapter = createNtfyNotificationAdapter({
    topic: "public-fixture-topic-with-thirty-two-characters",
    fetch: async (_url, init) => { bodies.push(init.body); return { ok: true, status: 200 }; },
  });
  const pulse = dailyPulse(5);
  const base = { id: "sequence", pulseId: pulse.id, dueAt: "2026-08-28T09:00:00.000Z", state: "due" as const, seriesRevision: 1, titleSnapshot: pulse.title };
  await adapter.send({ channel: "ntfy", pulse, occurrence: { ...base, ordinal: 3, final: false }, now: new Date() });
  await adapter.send({ channel: "ntfy", pulse, occurrence: { ...base, id: "sequence-two", ordinal: 4, final: false }, now: new Date() });
  await adapter.send({ channel: "ntfy", pulse, occurrence: { ...base, id: "sequence-final", ordinal: 5, final: true }, now: new Date() });
  assert.match(bodies[0]!, /3 reminders remain/);
  assert.match(bodies[1]!, /2 reminders remain/);
  assert.match(bodies[2]!, /Final reminder/);
});
