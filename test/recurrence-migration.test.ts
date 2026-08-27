import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalCreateDefinition,
  canonicalUpdateDefinition,
  adoptOpenOccurrenceForSeriesConversion,
  migrateLegacyRecurrence,
  recurrenceMigrationRequired,
  seriesProgress,
} from "../src/series.js";
import { parsePulseDefinitions } from "../src/model.js";
import { createEmptyPulseState } from "../src/storage.js";

const legacy = [
  {
    id: "legacy-once",
    title: "Legacy once",
    active: true,
    schedule: { type: "weekly" as const, daysOfWeek: ["friday" as const], time: "09:00", timezone: "UTC" },
  },
  {
    id: "legacy-repeat",
    title: "Legacy repeat",
    active: true,
    schedule: { type: "weekly" as const, daysOfWeek: ["sunday" as const], time: "08:50", timezone: "America/Los_Angeles" },
  },
];

test("legacy migration requires an explicit classification for every reminder", () => {
  assert.throws(() => migrateLegacyRecurrence({
    pulses: legacy,
    state: createEmptyPulseState(),
    now: new Date("2026-08-27T12:00:00.000Z"),
    classifications: [{ id: "legacy-once", mode: "once" }],
  }), /Classify every legacy reminder/);
});

test("legacy migration atomically creates bounded v2 definitions and adopts open work", () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "legacy-repeat:2026-08-30T15:50:00.000Z",
    pulseId: "legacy-repeat",
    dueAt: "2026-08-30T15:50:00.000Z",
    state: "due",
  });
  state.occurrences.push({
    id: "legacy-repeat:2026-09-06T15:50:00.000Z",
    pulseId: "legacy-repeat",
    dueAt: "2026-09-06T15:50:00.000Z",
    state: "scheduled",
  });

  const migrated = migrateLegacyRecurrence({
    pulses: legacy,
    state,
    now: new Date("2026-08-27T12:00:00.000Z"),
    classifications: [
      { id: "legacy-once", mode: "once" },
      { id: "legacy-repeat", mode: "repeat", end: { type: "count", occurrences: 30 } },
    ],
  });

  assert.equal(migrated.state.version, 2);
  assert.equal(migrated.pulses.every((pulse) => "version" in pulse.schedule && pulse.schedule.version === 2), true);
  assert.equal(migrated.pulses[0]?.schedule.type, "once");
  assert.deepEqual(migrated.pulses[1]?.schedule, {
    version: 2,
    type: "weekly",
    interval: 1,
    startDate: "2026-08-30",
    weekStartsOn: "sunday",
    daysOfWeek: ["sunday"],
    time: "08:50",
    timezone: "America/Los_Angeles",
    end: { type: "count", occurrences: 30 },
  });
  const adopted = migrated.state.occurrences.find((value) => value.pulseId === "legacy-repeat" && value.state === "due");
  assert.equal(adopted?.ordinal, 1);
  assert.equal(adopted?.seriesRevision, 1);
  assert.equal(adopted?.final, false);
  assert.equal(adopted?.titleSnapshot, "Legacy repeat");
  assert.equal(migrated.state.occurrences.filter((value) => value.pulseId === "legacy-repeat" && value.state !== "done").length, 1, "migration restores the one-open-occurrence invariant");
});

test("legacy one-time classification preserves an open snooze as final", () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "legacy-once:2026-08-28T09:00:00.000Z",
    pulseId: "legacy-once",
    dueAt: "2026-08-28T09:30:00.000Z",
    state: "scheduled",
    snoozedAt: "2026-08-28T09:00:00.000Z",
    snoozeCount: 1,
  });

  const migrated = migrateLegacyRecurrence({
    pulses: [legacy[0]!],
    state,
    now: new Date("2026-08-27T12:00:00.000Z"),
    classifications: [{ id: "legacy-once", mode: "once" }],
  });
  const occurrence = migrated.state.occurrences[0];
  assert.equal(occurrence?.dueAt, "2026-08-28T09:30:00.000Z");
  assert.equal(occurrence?.final, true);
  assert.equal(occurrence?.ordinal, 1);
  assert.equal(migrated.pulses[0]?.schedule.type, "once");
});

test("legacy one-time migration describes a cross-midnight snooze at its actual local date and time", () => {
  const state = createEmptyPulseState();
  state.occurrences.push({
    id: "legacy-once:2026-08-28T23:50:00.000Z",
    pulseId: "legacy-once",
    dueAt: "2026-08-29T00:20:00.000Z",
    state: "scheduled",
    snoozedAt: "2026-08-28T23:50:00.000Z",
    snoozeCount: 1,
  });

  const migrated = migrateLegacyRecurrence({
    pulses: [legacy[0]!],
    state,
    now: new Date("2026-08-28T12:00:00.000Z"),
    classifications: [{ id: "legacy-once", mode: "once" }],
  });

  assert.deepEqual(migrated.pulses[0]?.schedule, {
    version: 2,
    type: "once",
    date: "2026-08-29",
    time: "00:20",
    timezone: "UTC",
  });
});

test("migration rejects unknown, duplicate, or already-v2 definitions", () => {
  const base = {
    pulses: [legacy[0]!],
    state: createEmptyPulseState(),
    now: new Date("2026-08-27T12:00:00.000Z"),
  };
  assert.throws(() => migrateLegacyRecurrence({ ...base, classifications: [{ id: "unknown", mode: "once" }] }), /Classify every legacy reminder/);
  assert.throws(() => migrateLegacyRecurrence({ ...base, classifications: [{ id: "legacy-once", mode: "once" }, { id: "legacy-once", mode: "once" }] }), /exactly once/);
  const migrated = migrateLegacyRecurrence({ ...base, classifications: [{ id: "legacy-once", mode: "once" }] });
  assert.throws(() => migrateLegacyRecurrence({ ...base, pulses: migrated.pulses, classifications: [] }), /already uses bounded recurrence/);
});

test("server-owned revisions distinguish content edits from series edits", () => {
  const [draft] = parsePulseDefinitions([{
    id: "revisioned",
    title: "Revisioned",
    active: true,
    schedule: {
      version: 2,
      type: "once",
      date: "2026-08-30",
      time: "09:00",
      timezone: "UTC",
    },
  }]);
  const created = canonicalCreateDefinition(draft!);
  assert.equal(created.definitionRevision, 1);
  assert.equal(created.seriesRevision, 1);

  const renamed = canonicalUpdateDefinition(created, { ...created, title: "Renamed" }, 1);
  assert.equal(renamed.definitionRevision, 2);
  assert.equal(renamed.seriesRevision, 1);

  const rescheduled = canonicalUpdateDefinition(renamed, {
    ...renamed,
    schedule: { ...renamed.schedule, date: "2026-08-31" },
  }, 2);
  assert.equal(rescheduled.definitionRevision, 3);
  assert.equal(rescheduled.seriesRevision, 2);
  assert.throws(() => canonicalUpdateDefinition(rescheduled, rescheduled, 2), /revision conflict/i);
});

test("series progress is canonical and becomes complete only after final work is done", () => {
  const [pulse] = parsePulseDefinitions([{
    id: "progress",
    title: "Progress",
    active: true,
    schedule: {
      version: 2,
      type: "daily",
      interval: 1,
      startDate: "2026-08-28",
      time: "09:00",
      timezone: "UTC",
      end: { type: "count", occurrences: 2 },
    },
  }]);
  const occurrences = [
    { id: "one", pulseId: "progress", dueAt: "2026-08-28T09:00:00.000Z", state: "done" as const, completedAt: "2026-08-28T09:01:00.000Z", seriesRevision: 1, ordinal: 1 },
    { id: "two", pulseId: "progress", dueAt: "2026-08-29T09:00:00.000Z", state: "due" as const, seriesRevision: 1, ordinal: 2, final: true },
  ];
  assert.deepEqual(seriesProgress(pulse!, occurrences), { generated: 2, remaining: 0, complete: false });
  assert.deepEqual(seriesProgress(pulse!, [{ ...occurrences[0]! }, { ...occurrences[1]!, state: "done", completedAt: "2026-08-29T09:01:00.000Z" }]), {
    generated: 2,
    remaining: 0,
    complete: true,
  });
});

test("a date-ending series becomes complete while paused after its last eligible slot", () => {
  const [pulse] = parsePulseDefinitions([{
    id: "expired",
    title: "Expired",
    active: false,
    schedule: { version: 2, type: "daily", interval: 1, startDate: "2026-08-28", time: "09:00", timezone: "UTC", end: { type: "date", date: "2026-08-30" } },
  }]);
  assert.deepEqual(seriesProgress(pulse!, [], new Date("2026-08-31T00:00:00.000Z")), {
    generated: 0,
    endsOn: "2026-08-30",
    complete: true,
  });
  assert.deepEqual(seriesProgress(pulse!, [], new Date("2026-08-29T00:00:00.000Z")), {
    generated: 0,
    endsOn: "2026-08-30",
    complete: false,
  });
});

test("canonical definition guards reject legacy, past one-time, and unbounded updates", () => {
  assert.throws(() => canonicalCreateDefinition(legacy[0]!, new Date("2026-08-27T12:00:00.000Z")), /schedule version 2/);
  const [past] = parsePulseDefinitions([{ id: "past", title: "Past", active: true, schedule: { version: 2, type: "once", date: "2026-08-26", time: "09:00", timezone: "UTC" } }]);
  assert.throws(() => canonicalCreateDefinition(past!, new Date("2026-08-27T12:00:00.000Z")), /future/);
  const bounded = { ...canonicalCreateDefinition(parsePulseDefinitions([{ id: "bounded", title: "Bounded", active: true, schedule: { version: 2, type: "once", date: "2026-08-30", time: "09:00", timezone: "UTC" } }])[0]!), definitionRevision: 1 };
  assert.throws(() => canonicalUpdateDefinition(bounded, legacy[0]!, 1), /schedule version 2/);
});

test("series conversion adoption covers no-op, untouched, due, and final-one cases", () => {
  const [once] = parsePulseDefinitions([{ id: "convert", title: "Convert", active: true, schedule: { version: 2, type: "once", date: "2026-08-30", time: "09:00", timezone: "UTC" }, definitionRevision: 1, seriesRevision: 1 }]);
  const [daily] = parsePulseDefinitions([{ id: "convert", title: "Convert", active: true, schedule: { version: 2, type: "daily", interval: 1, startDate: "2026-08-30", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 1 } }, definitionRevision: 2, seriesRevision: 2 }]);
  const noChange = createEmptyPulseState();
  adoptOpenOccurrenceForSeriesConversion(noChange, once!, { ...once!, definitionRevision: 2 });
  assert.deepEqual(noChange.occurrences, []);
  const missing = createEmptyPulseState();
  adoptOpenOccurrenceForSeriesConversion(missing, once!, daily!);
  assert.deepEqual(missing.occurrences, []);

  const [dailyEdit] = parsePulseDefinitions([{ ...daily!, definitionRevision: 3, seriesRevision: 3, schedule: { ...daily!.schedule, interval: 2 } }]);
  const recurringOnly = createEmptyPulseState();
  recurringOnly.occurrences.push({ id: "recurring", pulseId: "convert", dueAt: "2026-08-30T09:00:00.000Z", state: "due", seriesRevision: 2, ordinal: 1 });
  adoptOpenOccurrenceForSeriesConversion(recurringOnly, daily!, dailyEdit!);
  assert.equal(recurringOnly.occurrences[0]?.seriesRevision, 2, "ordinary recurring edits begin after current work rather than adopting it");

  const untouched = createEmptyPulseState();
  untouched.occurrences.push({ id: "future", pulseId: "convert", dueAt: "2026-08-30T09:00:00.000Z", state: "scheduled" });
  adoptOpenOccurrenceForSeriesConversion(untouched, once!, daily!);
  assert.equal(untouched.occurrences[0]?.seriesRevision, undefined);

  const due = createEmptyPulseState();
  due.occurrences.push({ id: "due", pulseId: "convert", dueAt: "2026-08-30T09:00:00.000Z", state: "due" });
  adoptOpenOccurrenceForSeriesConversion(due, once!, daily!);
  assert.deepEqual({ revision: due.occurrences[0]?.seriesRevision, ordinal: due.occurrences[0]?.ordinal, final: due.occurrences[0]?.final }, { revision: 2, ordinal: 1, final: true });

  const [dateEnded] = parsePulseDefinitions([{ ...daily!, definitionRevision: 2, seriesRevision: 2, schedule: { ...daily!.schedule, end: { type: "date", date: "2026-09-05" } } }]);
  const dueForDateSeries = createEmptyPulseState();
  dueForDateSeries.occurrences.push({ id: "due-date", pulseId: "convert", dueAt: "2026-08-30T09:00:00.000Z", state: "due" });
  adoptOpenOccurrenceForSeriesConversion(dueForDateSeries, once!, dateEnded!);
  assert.equal(dueForDateSeries.occurrences[0]?.final, false);

  const [multiDaily] = parsePulseDefinitions([{ ...daily!, definitionRevision: 2, seriesRevision: 2, schedule: { ...daily!.schedule, end: { type: "count", occurrences: 2 } } }]);
  const dueForMultiSeries = createEmptyPulseState();
  dueForMultiSeries.occurrences.push({ id: "due-multi", pulseId: "convert", dueAt: "2026-08-30T09:00:00.000Z", state: "due" });
  adoptOpenOccurrenceForSeriesConversion(dueForMultiSeries, once!, multiDaily!);
  assert.equal(dueForMultiSeries.occurrences[0]?.final, false);

  const snoozed = createEmptyPulseState();
  snoozed.occurrences.push({ id: "snoozed", pulseId: "convert", dueAt: "2026-08-30T09:30:00.000Z", state: "scheduled", snoozedAt: "2026-08-30T09:00:00.000Z" });
  adoptOpenOccurrenceForSeriesConversion(snoozed, once!, daily!);
  assert.deepEqual({ revision: snoozed.occurrences[0]?.seriesRevision, ordinal: snoozed.occurrences[0]?.ordinal, final: snoozed.occurrences[0]?.final }, { revision: 2, ordinal: 1, final: true });
});

test("series progress reports legacy, one-time, count, and migration states without guessing", () => {
  assert.equal(recurrenceMigrationRequired(legacy), true);
  assert.equal(recurrenceMigrationRequired([{ ...legacy[0]!, schedule: { ...legacy[0]!.schedule, version: 1 } } as never]), true);
  const migrated = migrateLegacyRecurrence({ pulses: [legacy[0]!], state: createEmptyPulseState(), now: new Date("2026-08-27T12:00:00.000Z"), classifications: [{ id: "legacy-once", mode: "once" }] });
  assert.equal(recurrenceMigrationRequired(migrated.pulses), false);
  assert.deepEqual(seriesProgress(legacy[0]!, []), { generated: 0, complete: false });
  const once = migrated.pulses[0]!;
  assert.deepEqual(seriesProgress(once, []), { generated: 0, complete: false });
  assert.deepEqual(seriesProgress(once, [{ id: "done", pulseId: once.id, dueAt: "2026-08-28T09:00:00.000Z", state: "done", completedAt: "2026-08-28T09:01:00.000Z", seriesRevision: 1, ordinal: 1 }]), { generated: 1, complete: true });
  assert.deepEqual(seriesProgress(once, [{ id: "old-series", pulseId: once.id, dueAt: "2026-08-28T09:00:00.000Z", state: "done", completedAt: "2026-08-28T09:01:00.000Z", seriesRevision: 2, ordinal: 1 }]), { generated: 0, complete: false });
});

test("migration rejects mixed schemas and preserves cleanup plus completed title evidence", () => {
  const already = migrateLegacyRecurrence({ pulses: [legacy[0]!], state: createEmptyPulseState(), now: new Date("2026-08-27T12:00:00.000Z"), classifications: [{ id: "legacy-once", mode: "once" }] }).pulses[0]!;
  assert.throws(() => migrateLegacyRecurrence({ pulses: [legacy[0]!, already], state: createEmptyPulseState(), now: new Date("2026-08-27T12:00:00.000Z"), classifications: [{ id: "legacy-once", mode: "once" }] }), /mixed legacy and bounded/);
  const state = createEmptyPulseState();
  state.pendingNotificationSequenceCleanups = [{ pulseId: "legacy-repeat", occurrenceId: "old", sequenceId: "pulse-DPIYt07Sw9x4urjlPwG83KbIVFcEznMda7KHPBgi7ro", requestedAt: "2026-08-27T12:00:00.000Z", titleSnapshot: "Legacy repeat" }];
  state.occurrences.push({ id: "old", pulseId: "legacy-repeat", dueAt: "2026-08-23T15:50:00.000Z", state: "done", completedAt: "2026-08-23T16:00:00.000Z" });
  state.events.push(
    { id: "event-with-metadata", pulseId: "legacy-repeat", occurrenceId: "old", type: "notification_sent", at: "2026-08-23T15:50:00.000Z", metadata: { channel: "ntfy" } },
    { id: "event-without-metadata", pulseId: "legacy-repeat", occurrenceId: "old", type: "occurrence_completed", at: "2026-08-23T16:00:00.000Z" },
  );
  const result = migrateLegacyRecurrence({ pulses: [legacy[1]!], state, now: new Date("2026-08-27T12:00:00.000Z"), classifications: [{ id: "legacy-repeat", mode: "repeat", weekStartsOn: "monday", end: { type: "date", date: "2027-01-01" } }] });
  assert.equal(result.state.pendingNotificationSequenceCleanups?.[0]?.sequenceId, state.pendingNotificationSequenceCleanups[0]?.sequenceId);
  assert.equal(result.state.occurrences.find((occurrence) => occurrence.id === "old")?.titleSnapshot, "Legacy repeat");
  assert.notEqual(result.state.events[0]?.metadata, state.events[0]?.metadata, "migration clones event metadata instead of retaining mutable aliases");
  assert.equal(result.pulses[0]?.schedule.type === "weekly" && result.pulses[0].schedule.weekStartsOn, "monday");
});

test("migration rejects an inactive legacy reminder with no open work to adopt", () => {
  assert.throws(() => migrateLegacyRecurrence({
    pulses: [{ ...legacy[0]!, active: false }],
    state: createEmptyPulseState(),
    now: new Date("2026-08-27T12:00:00.000Z"),
    classifications: [{ id: "legacy-once", mode: "once" }],
  }), /no schedulable occurrence/);
});

test("migration applies documented repeat defaults without overwriting existing history titles", () => {
  const state = createEmptyPulseState();
  state.occurrences.push({ id: "finished", pulseId: "legacy-repeat", dueAt: "2026-08-23T15:50:00.000Z", state: "done", completedAt: "2026-08-23T16:00:00.000Z", titleSnapshot: "Original title" });
  const result = migrateLegacyRecurrence({
    pulses: [legacy[1]!],
    state,
    now: new Date("2026-08-27T12:00:00.000Z"),
    classifications: [{ id: "legacy-repeat", mode: "repeat" }],
  });
  assert.deepEqual(result.pulses[0]?.schedule, {
    version: 2,
    type: "weekly",
    interval: 1,
    startDate: "2026-08-30",
    weekStartsOn: "sunday",
    daysOfWeek: ["sunday"],
    time: "08:50",
    timezone: "America/Los_Angeles",
    end: { type: "count", occurrences: 30 },
  });
  assert.equal(result.state.occurrences.find((occurrence) => occurrence.id === "finished")?.titleSnapshot, "Original title");
});
