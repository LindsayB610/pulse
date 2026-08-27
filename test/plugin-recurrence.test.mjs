import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultReminderDate, localeWeekStartsOn, monthlyRuleLabels, pulseDefinitionFromForm, recurrencePreview, recurrenceSummary } from "../plugin/dist/definition.js";

const common = { title: "Fixture", date: "2026-08-28", time: "09:30", timezone: "America/Los_Angeles" };

test("the plugin defaults new reminders to one time", () => {
  const definition = pulseDefinitionFromForm({ ...common, now: new Date("2026-08-27T12:00:00.000Z") });
  assert.deepEqual(definition.schedule, { version: 2, type: "once", date: "2026-08-28", time: "09:30", timezone: "America/Los_Angeles" });
  assert.match(recurrenceSummary(definition), /^Once/);
});

test("plugin serialization covers every bounded frequency and end mode", () => {
  const daily = pulseDefinitionFromForm({ ...common, repeat: true, frequency: "daily", interval: "2", endCount: "30" });
  const weekly = pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", daysOfWeek: ["monday", "wednesday"], endType: "date", endDate: "2027-01-01" });
  const monthly = pulseDefinitionFromForm({ ...common, repeat: true, frequency: "monthly", monthlyRule: "lastDay", endCount: "12" });
  const yearly = pulseDefinitionFromForm({ ...common, repeat: true, frequency: "yearly", endCount: "5" });

  assert.deepEqual(daily.schedule.end, { type: "count", occurrences: 30 });
  assert.deepEqual(weekly.schedule.daysOfWeek, ["monday", "wednesday"]);
  assert.deepEqual(weekly.schedule.end, { type: "date", date: "2027-01-01" });
  assert.deepEqual(monthly.schedule.rule, { type: "dayOfMonth", day: 31, missingDate: "lastDay" });
  assert.deepEqual({ month: yearly.schedule.month, day: yearly.schedule.day }, { month: 8, day: 28 });
  for (const definition of [daily, weekly, monthly, yearly]) assert.equal(definition.schedule.version, 2);
});

test("plugin form validation rejects hidden infinity and invalid boundaries", () => {
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", daysOfWeek: [], endCount: "30" }), /at least one weekday/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "daily", endCount: "366" }), /1 to 365/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "monthly", endType: "date", endDate: "2032-01-01" }), /five years/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, now: new Date("2026-08-29T00:00:00.000Z") }), /future/);
});

test("default reminder date uses today only while the chosen local time remains future", () => {
  assert.equal(defaultReminderDate(new Date("2026-08-28T15:00:00.000Z"), "America/Los_Angeles", "09:00"), "2026-08-28");
  assert.equal(defaultReminderDate(new Date("2026-08-28T17:00:00.000Z"), "America/Los_Angeles", "09:00"), "2026-08-29");
});

test("the editor preview exposes the first three local dates and calculated bounded total", () => {
  const definition = pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", daysOfWeek: ["monday", "wednesday"], endType: "count", endCount: "5" });
  assert.deepEqual(recurrencePreview(definition), {
    dates: ["2026-08-31", "2026-09-02", "2026-09-07"],
    first: "2026-08-31",
    last: "2026-09-14",
    total: 5,
  });
});

test("week starts are locale-derived and saved canonically", () => {
  assert.equal(localeWeekStartsOn("en-US"), "sunday");
  assert.equal(localeWeekStartsOn("en-GB"), "monday");
  const definition = pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", daysOfWeek: ["monday"], locale: "en-GB", endCount: "2" });
  assert.equal(definition.schedule.weekStartsOn, "monday");
});

test("date-ending plugin schedules reject totals above the product cap", () => {
  assert.throws(
    () => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "daily", endType: "date", endDate: "2027-08-30" }),
    /365 reminders/,
  );
});

test("count-ending plugin schedules reject totals that cannot fit inside five years", () => {
  assert.throws(
    () => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "yearly", endCount: "365" }),
    /five-year series limit/,
  );
});

test("plugin previews report the resolved time when a wall clock time falls in a daylight-saving gap", () => {
  const springGap = pulseDefinitionFromForm({ title: "Gap", date: "2027-03-14", time: "02:30", timezone: "America/Los_Angeles" });
  const halfHourGap = pulseDefinitionFromForm({ title: "Half gap", date: "2026-10-04", time: "02:15", timezone: "Australia/Lord_Howe" });
  const fallOverlap = pulseDefinitionFromForm({ title: "Overlap", date: "2026-11-01", time: "01:30", timezone: "America/Los_Angeles" });
  assert.match(recurrenceSummary(springGap), /3:30 AM/);
  assert.match(recurrenceSummary(halfHourGap), /2:45 AM/);
  assert.match(recurrenceSummary(fallOverlap), /1:30 AM/);
});

test("plugin and engine use the same clamped five-year horizon for leap-day starts", () => {
  const leap = pulseDefinitionFromForm({ title: "Leap", date: "2028-02-29", time: "09:30", timezone: "UTC", repeat: true, frequency: "yearly", endType: "date", endDate: "2033-02-28" });
  assert.equal(recurrencePreview(leap).last, "2032-02-29");
  assert.throws(
    () => pulseDefinitionFromForm({ title: "Leap", date: "2028-02-29", time: "09:30", timezone: "UTC", repeat: true, frequency: "yearly", endType: "date", endDate: "2033-03-01" }),
    /five years/,
  );
});

test("monthly choices describe the exact selected-date rule before saving", () => {
  assert.deepEqual(monthlyRuleLabels("2026-08-31"), {
    dayOfMonth: "On day 31; skips months without it",
    nthWeekday: "On the fifth Monday; skips months without one",
    lastDay: "On the last day of the month",
  });
  assert.equal(monthlyRuleLabels("2026-08-15").dayOfMonth, "On day 15");
  assert.deepEqual(monthlyRuleLabels("not-a-date"), {
    dayOfMonth: "On the same date",
    nthWeekday: "On the same weekday position",
    lastDay: "On the last day of the month",
  });
});

test("plugin summaries cover every frequency, interval, ending, and exceptional calendar label", () => {
  const definitions = [
    pulseDefinitionFromForm({ ...common, repeat: true, frequency: "daily", interval: "1", endCount: "1" }),
    pulseDefinitionFromForm({ ...common, repeat: true, frequency: "daily", interval: "2", endType: "date", endDate: "2026-09-03" }),
    pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", interval: "2", daysOfWeek: ["monday", "wednesday"], endCount: "2" }),
    pulseDefinitionFromForm({ ...common, date: "2026-08-31", repeat: true, frequency: "monthly", monthlyRule: "dayOfMonth", endCount: "2" }),
    pulseDefinitionFromForm({ ...common, date: "2026-08-31", repeat: true, frequency: "monthly", monthlyRule: "lastDay", interval: "2", endCount: "2" }),
    pulseDefinitionFromForm({ ...common, date: "2026-08-31", repeat: true, frequency: "monthly", monthlyRule: "nthWeekday", monthlyOrdinal: "5", monthlyWeekday: "monday", endCount: "2" }),
    pulseDefinitionFromForm({ ...common, date: "2026-08-28", repeat: true, frequency: "monthly", monthlyRule: "nthWeekday", monthlyOrdinal: "last", monthlyWeekday: "friday", endCount: "2" }),
    pulseDefinitionFromForm({ ...common, date: "2028-02-29", repeat: true, frequency: "yearly", endCount: "2" }),
    pulseDefinitionFromForm({ ...common, repeat: true, frequency: "yearly", interval: "2", endCount: "2" }),
  ];
  assert.deepEqual(definitions.map(recurrenceSummary), [
    "Daily at 9:30 AM · 1 reminder",
    "Every 2 days at 9:30 AM · ends Thu, Sep 3, 2026",
    "Every 2 weeks on Monday, Wednesday at 9:30 AM · 2 reminders",
    "Monthly on day 31 at 9:30 AM · 2 reminders",
    "Every 2 months on the last day at 9:30 AM · 2 reminders",
    "Monthly on the fifth Monday (skips months without one) at 9:30 AM · 2 reminders",
    "Monthly on the last Friday at 9:30 AM · 2 reminders",
    "Yearly on February 29 (leap years only) at 9:30 AM · 2 reminders",
    "Every 2 years on August 28 at 9:30 AM · 2 reminders",
  ]);
  assert.deepEqual(recurrencePreview(definitions[0], -1).dates, []);
});

test("plugin form helper rejects malformed visible fields and impossible recurrence rules", () => {
  assert.throws(() => pulseDefinitionFromForm({ ...common, title: "" }), /reminder name/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, title: "!!!" }), /reminder name/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, date: "2026-02-30" }), /valid reminder date/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, time: "9:30" }), /valid reminder time/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, time: "24:00" }), /valid reminder time/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, timezone: "Mars/Olympus" }), /IANA time zone/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, snooze: "1.5" }), /whole number/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "daily", interval: "0" }), /whole number/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", daysOfWeek: ["funday"] }), /weekday/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", daysOfWeek: ["friday"], weekStartsOn: "funday" }), /start of week/);
  assert.throws(() => pulseDefinitionFromForm({ ...common, repeat: true, frequency: "weekly", endType: "date", endDate: "2026-08-27" }), /before its start/);
  assert.throws(() => recurrencePreview({ schedule: { version: 2, type: "weekly", interval: 1, startDate: "2026-08-28", weekStartsOn: "sunday", daysOfWeek: [], time: "09:30", timezone: "UTC", end: { type: "date", date: "2026-08-28" } } }), /creates no reminders/);
});

test("locale fallback remains stable when Intl rejects an invalid locale", () => {
  assert.equal(localeWeekStartsOn("not_a_locale"), "sunday");
  assert.equal(localeWeekStartsOn("en-CA"), "sunday");
  assert.equal(localeWeekStartsOn("fr-FR"), "monday");
});
