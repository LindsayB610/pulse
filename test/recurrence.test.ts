import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_SERIES_OCCURRENCES,
  parsePulseSchedule,
  previewSchedule,
  scheduleInstants,
  scheduleSummary,
} from "../src/recurrence.js";
import { generateNextOccurrence, parsePulseDefinitions } from "../src/model.js";

const zone = "America/Los_Angeles";

test("one-time schedules produce exactly one future occurrence", () => {
  const schedule = parsePulseSchedule({
    version: 2,
    type: "once",
    date: "2026-08-28",
    time: "09:30",
    timezone: zone,
  });

  assert.deepEqual(previewSchedule(schedule, { limit: 3 }), ["2026-08-28T16:30:00.000Z"]);
  assert.equal(scheduleSummary(schedule), "Once · Fri, Aug 28 at 9:30 AM");
});

test("daily schedules are bounded by count", () => {
  const schedule = parsePulseSchedule({
    version: 2,
    type: "daily",
    interval: 2,
    startDate: "2026-08-28",
    time: "09:30",
    timezone: zone,
    end: { type: "count", occurrences: 3 },
  });

  assert.deepEqual(previewSchedule(schedule, { limit: 10 }), [
    "2026-08-28T16:30:00.000Z",
    "2026-08-30T16:30:00.000Z",
    "2026-09-01T16:30:00.000Z",
  ]);
});

test("weekly schedules order multiple days and anchor multi-week intervals", () => {
  const schedule = parsePulseSchedule({
    version: 2,
    type: "weekly",
    interval: 2,
    startDate: "2026-08-26",
    weekStartsOn: "sunday",
    daysOfWeek: ["monday", "wednesday"],
    time: "09:30",
    timezone: zone,
    end: { type: "count", occurrences: 5 },
  });

  assert.deepEqual(previewSchedule(schedule, { limit: 10 }), [
    "2026-08-26T16:30:00.000Z",
    "2026-09-07T16:30:00.000Z",
    "2026-09-09T16:30:00.000Z",
    "2026-09-21T16:30:00.000Z",
    "2026-09-23T16:30:00.000Z",
  ]);
});

test("monthly late dates skip or use the last day only when explicitly selected", () => {
  const exact = parsePulseSchedule({
    version: 2,
    type: "monthly",
    interval: 1,
    startDate: "2026-01-31",
    rule: { type: "dayOfMonth", day: 31, missingDate: "skip" },
    time: "09:00",
    timezone: zone,
    end: { type: "count", occurrences: 3 },
  });
  const last = parsePulseSchedule({
    ...exact,
    rule: { type: "dayOfMonth", day: 31, missingDate: "lastDay" },
  });

  assert.deepEqual(previewSchedule(exact, { limit: 3 }), [
    "2026-01-31T17:00:00.000Z",
    "2026-03-31T16:00:00.000Z",
    "2026-05-31T16:00:00.000Z",
  ]);
  assert.deepEqual(previewSchedule(last, { limit: 3 }), [
    "2026-01-31T17:00:00.000Z",
    "2026-02-28T17:00:00.000Z",
    "2026-03-31T16:00:00.000Z",
  ]);
});

test("monthly ordinal rules support fifth and last weekdays", () => {
  const fifthMonday = parsePulseSchedule({
    version: 2,
    type: "monthly",
    interval: 1,
    startDate: "2026-01-01",
    rule: { type: "nthWeekday", ordinal: 5, day: "monday" },
    time: "12:00",
    timezone: "UTC",
    end: { type: "count", occurrences: 3 },
  });
  const lastFriday = parsePulseSchedule({
    ...fifthMonday,
    rule: { type: "nthWeekday", ordinal: "last", day: "friday" },
  });

  assert.deepEqual(previewSchedule(fifthMonday, { limit: 3 }), [
    "2026-03-30T12:00:00.000Z",
    "2026-06-29T12:00:00.000Z",
    "2026-08-31T12:00:00.000Z",
  ]);
  assert.deepEqual(previewSchedule(lastFriday, { limit: 2 }), [
    "2026-01-30T12:00:00.000Z",
    "2026-02-27T12:00:00.000Z",
  ]);
});

test("yearly February 29 schedules skip non-leap years", () => {
  const schedule = parsePulseSchedule({
    version: 2,
    type: "yearly",
    interval: 1,
    startDate: "2028-02-29",
    month: 2,
    day: 29,
    missingDate: "skip",
    time: "08:00",
    timezone: "UTC",
    end: { type: "count", occurrences: 2 },
  });

  assert.deepEqual(previewSchedule(schedule, { limit: 3 }), [
    "2028-02-29T08:00:00.000Z",
    "2032-02-29T08:00:00.000Z",
  ]);
});

test("date endings are inclusive in the schedule timezone", () => {
  const schedule = parsePulseSchedule({
    version: 2,
    type: "daily",
    interval: 1,
    startDate: "2026-08-28",
    time: "23:30",
    timezone: zone,
    end: { type: "date", date: "2026-08-30" },
  });

  assert.equal(previewSchedule(schedule, { limit: 10 }).length, 3);
});

test("spring gaps advance by the exact gap and fall-back uses the earlier instant", () => {
  const spring = parsePulseSchedule({
    version: 2,
    type: "once",
    date: "2026-03-08",
    time: "02:30",
    timezone: zone,
  });
  const fall = parsePulseSchedule({
    version: 2,
    type: "once",
    date: "2026-11-01",
    time: "01:30",
    timezone: zone,
  });

  assert.deepEqual(previewSchedule(spring, { limit: 1 }), ["2026-03-08T10:30:00.000Z"]);
  assert.deepEqual(previewSchedule(fall, { limit: 1 }), ["2026-11-01T08:30:00.000Z"]);
});

test("DST resolution also handles half-hour gaps and European fall-back", () => {
  const lordHowe = parsePulseSchedule({ version: 2, type: "once", date: "2026-10-04", time: "02:15", timezone: "Australia/Lord_Howe" });
  const berlin = parsePulseSchedule({ version: 2, type: "once", date: "2026-10-25", time: "02:30", timezone: "Europe/Berlin" });
  assert.deepEqual(previewSchedule(lordHowe, { limit: 1 }), ["2026-10-03T15:45:00.000Z"]);
  assert.deepEqual(previewSchedule(berlin, { limit: 1 }), ["2026-10-25T00:30:00.000Z"]);
});

test("recurring schedules reject unbounded or unsafe definitions", () => {
  const base = {
    version: 2,
    type: "weekly",
    interval: 1,
    startDate: "2026-08-30",
    weekStartsOn: "sunday",
    daysOfWeek: ["sunday"],
    time: "09:30",
    timezone: zone,
  };

  assert.throws(() => parsePulseSchedule(base), /finite end/i);
  assert.throws(
    () => parsePulseSchedule({ ...base, end: { type: "count", occurrences: MAX_SERIES_OCCURRENCES + 1 } }),
    /365 or fewer/,
  );
  assert.throws(
    () => parsePulseSchedule({ ...base, daysOfWeek: [], end: { type: "count", occurrences: 30 } }),
    /at least one weekday/,
  );
  assert.throws(
    () => parsePulseSchedule({ ...base, timezone: "Mars/Olympus", end: { type: "count", occurrences: 30 } }),
    /valid IANA/,
  );
  assert.throws(
    () => parsePulseSchedule({ ...base, end: { type: "date", date: "2032-01-01" } }),
    /five years/,
  );
  assert.throws(
    () => parsePulseSchedule({ ...base, type: "daily", end: { type: "date", date: "2027-08-30" } }),
    /365 occurrences/,
  );
  assert.throws(
    () => parsePulseSchedule({ ...base, type: "yearly", month: 8, day: 30, missingDate: "skip", end: { type: "count", occurrences: 365 } }),
    /five-year series limit/,
  );
});

test("generated previews are increasing, bounded, and duplicate-free", () => {
  const schedule = parsePulseSchedule({
    version: 2,
    type: "weekly",
    interval: 1,
    startDate: "2026-08-28",
    weekStartsOn: "monday",
    daysOfWeek: ["monday", "wednesday", "friday"],
    time: "09:30",
    timezone: "Europe/Berlin",
    end: { type: "count", occurrences: 365 },
  });
  const values = previewSchedule(schedule, { limit: 365 });

  assert.equal(values.length, 365);
  assert.equal(new Set(values).size, values.length);
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(Date.parse(values[index]!) > Date.parse(values[index - 1]!));
  }
});

test("v2 generation assigns stable series metadata and stops at count exhaustion", () => {
  const [pulse] = parsePulseDefinitions([{
    id: "bounded-weekly",
    title: "Bounded weekly",
    active: true,
    definitionRevision: 4,
    seriesRevision: 2,
    schedule: {
      version: 2,
      type: "weekly",
      interval: 1,
      startDate: "2026-08-30",
      weekStartsOn: "sunday",
      daysOfWeek: ["sunday"],
      time: "09:30",
      timezone: zone,
      end: { type: "count", occurrences: 2 },
    },
  }]);
  const first = generateNextOccurrence(pulse!, { after: new Date("2026-08-27T00:00:00.000Z") });
  const second = generateNextOccurrence(pulse!, {
    after: new Date(first!.dueAt),
    existingOccurrences: [{ ...first!, state: "done", completedAt: "2026-08-30T17:00:00.000Z" }],
  });

  assert.deepEqual(
    { seriesRevision: first?.seriesRevision, ordinal: first?.ordinal, final: first?.final, title: first?.titleSnapshot },
    { seriesRevision: 2, ordinal: 1, final: false, title: "Bounded weekly" },
  );
  assert.equal(second?.ordinal, 2);
  assert.equal(second?.final, true);
  assert.equal(generateNextOccurrence(pulse!, {
    after: new Date(second!.dueAt),
    existingOccurrences: [first!, second!],
  }), null);
});

test("missed cadence creates only the most recent catch-up occurrence", () => {
  const [pulse] = parsePulseDefinitions([{
    id: "catch-up",
    title: "Catch up",
    active: true,
    schedule: {
      version: 2,
      type: "daily",
      interval: 1,
      startDate: "2026-08-01",
      time: "09:00",
      timezone: "UTC",
      end: { type: "count", occurrences: 30 },
    },
  }]);

  assert.equal(
    generateNextOccurrence(pulse!, {
      after: new Date("2026-08-20T12:00:00.000Z"),
      includeMissed: true,
    })?.dueAt,
    "2026-08-20T09:00:00.000Z",
  );
});

test("schedule summaries cover every cadence, interval, ending, and monthly rule", () => {
  const schedules = [
    parsePulseSchedule({ version: 2, type: "daily", interval: 1, startDate: "2026-08-28", time: "00:05", timezone: "UTC", end: { type: "count", occurrences: 1 } }),
    parsePulseSchedule({ version: 2, type: "daily", interval: 2, startDate: "2026-08-28", time: "13:05", timezone: "UTC", end: { type: "date", date: "2026-09-03" } }),
    parsePulseSchedule({ version: 2, type: "weekly", interval: 1, startDate: "2026-08-28", weekStartsOn: "monday", daysOfWeek: ["friday"], time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
    parsePulseSchedule({ version: 2, type: "weekly", interval: 2, startDate: "2026-08-28", weekStartsOn: "monday", daysOfWeek: ["monday", "friday"], time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
    parsePulseSchedule({ version: 2, type: "monthly", interval: 1, startDate: "2026-01-31", rule: { type: "dayOfMonth", day: 31, missingDate: "skip" }, time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
    parsePulseSchedule({ version: 2, type: "monthly", interval: 2, startDate: "2026-01-31", rule: { type: "dayOfMonth", day: 31, missingDate: "lastDay" }, time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
    parsePulseSchedule({ version: 2, type: "monthly", interval: 1, startDate: "2026-01-01", rule: { type: "nthWeekday", ordinal: "last", day: "friday" }, time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
    parsePulseSchedule({ version: 2, type: "yearly", interval: 1, startDate: "2028-02-29", month: 2, day: 29, missingDate: "skip", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
    parsePulseSchedule({ version: 2, type: "yearly", interval: 2, startDate: "2026-08-28", month: 8, day: 28, missingDate: "skip", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } }),
  ];
  assert.deepEqual(schedules.map(scheduleSummary), [
    "Daily at 12:05 AM · 1 reminder",
    "Every 2 days at 1:05 PM · ends Sep 3, 2026",
    "Weekly on Friday at 9:00 AM · 2 reminders",
    "Every 2 weeks on Monday, Friday at 9:00 AM · 2 reminders",
    "Monthly on day 31 at 9:00 AM · 2 reminders",
    "Every 2 months on the last day at 9:00 AM · 2 reminders",
    "Monthly on the last Friday at 9:00 AM · 2 reminders",
    "Yearly on February 29 at 9:00 AM · 2 reminders",
    "Every 2 years on August 28 at 9:00 AM · 2 reminders",
  ]);
  assert.equal(scheduleInstants(schedules[0]!, { respectCount: false }).length, MAX_SERIES_OCCURRENCES);
  assert.deepEqual(previewSchedule(schedules[1]!, { limit: -1 }), []);
  assert.deepEqual(previewSchedule(schedules[0]!, { after: new Date("2026-08-28T00:05:00.000Z") }), []);
});

test("schedule parser rejects every malformed discriminator and calendar branch", () => {
  const weekly = { version: 2, type: "weekly", interval: 1, startDate: "2026-08-28", weekStartsOn: "monday", daysOfWeek: ["friday"], time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } };
  assert.throws(() => parsePulseSchedule(null), /must be an object/);
  assert.throws(() => parsePulseSchedule({ ...weekly, version: 1 }), /version must be 2/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "hourly" }), /Unsupported pulse schedule type/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "" }), /non-empty string/);
  assert.throws(() => parsePulseSchedule({ ...weekly, time: "9:00" }), /HH:mm/);
  assert.throws(() => parsePulseSchedule({ ...weekly, time: "24:00" }), /out of range/);
  assert.throws(() => parsePulseSchedule({ ...weekly, startDate: "2026-02-30" }), /real date/);
  assert.throws(() => parsePulseSchedule({ ...weekly, daysOfWeek: ["friday", "friday"] }), /unique/);
  assert.throws(() => parsePulseSchedule({ ...weekly, daysOfWeek: ["funday"] }), /Unsupported day/);
  assert.throws(() => parsePulseSchedule({ ...weekly, end: { type: "date", date: "2026-08-27" } }), /before the start/);
  assert.throws(() => parsePulseSchedule({ ...weekly, end: { type: "forever" } }), /finite end/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "monthly", rule: { type: "dayOfMonth", day: 31, missingDate: "move" } }), /skip or lastDay/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "monthly", rule: { type: "nthWeekday", ordinal: 6, day: "friday" } }), /1–5 or last/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "monthly", rule: { type: "moonPhase" } }), /dayOfMonth or nthWeekday/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "yearly", month: 2, day: 30, missingDate: "skip" }), /real calendar date/);
  assert.throws(() => parsePulseSchedule({ ...weekly, type: "yearly", month: 8, day: 28, missingDate: "lastDay" }), /must be skip/);
});
