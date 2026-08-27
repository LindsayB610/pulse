export const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export const deliveryRetryMinutes = 5;
export const recurrenceDefaults = { daily: 30, weekly: 30, monthly: 12, yearly: 5 } as const;

export type Frequency = keyof typeof recurrenceDefaults;
export type PulseDefinitionInput = {
  id?: string;
  title: string;
  date: string;
  time: string;
  timezone: string;
  active?: boolean;
  snooze?: string;
  repeat?: boolean;
  frequency?: Frequency;
  interval?: string;
  daysOfWeek?: string[];
  weekStartsOn?: string;
  monthlyRule?: "dayOfMonth" | "nthWeekday" | "lastDay";
  monthlyOrdinal?: "1" | "2" | "3" | "4" | "5" | "last";
  monthlyWeekday?: string;
  endType?: "count" | "date";
  endCount?: string;
  endDate?: string;
  now?: Date;
  locale?: string;
};

export type RecurrencePreview = { dates: string[]; first: string; last: string; total: number };

export function monthlyRuleLabels(date: string): { dayOfMonth: string; nthWeekday: string; lastDay: string } {
  try {
    validDate(date, "Choose a valid reminder date.");
    const local = parseDate(date);
    const ordinal = ordinalForDay(local.day);
    const ordinalWord = ["", "first", "second", "third", "fourth", "fifth"][Number(ordinal)];
    const skipped = local.day > 28 ? "; skips months without it" : "";
    const ordinalSkipped = ordinal === "5" ? "; skips months without one" : "";
    return {
      dayOfMonth: `On day ${local.day}${skipped}`,
      nthWeekday: `On the ${ordinalWord} ${titleCase(dayForDate(date))}${ordinalSkipped}`,
      lastDay: "On the last day of the month",
    };
  } catch {
    return {
      dayOfMonth: "On the same date",
      nthWeekday: "On the same weekday position",
      lastDay: "On the last day of the month",
    };
  }
}

export function pulseDefinitionFromForm(input: PulseDefinitionInput): Record<string, unknown> {
  const title = input.title.trim();
  if (!title) throw new Error("Enter a reminder name.");
  const date = validDate(input.date, "Choose a valid reminder date.");
  const time = validTime(input.time);
  const timezone = validTimezone(input.timezone);
  const snoozeEveryMinutes = wholeNumber(input.snooze ?? "30", 1, 10_080, "Snooze must be a whole number from 1 to 10,080 minutes.");
  const id = input.id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) throw new Error("Enter a reminder name.");
  const schedule = input.repeat
    ? recurringSchedule(input, date, time, timezone)
    : { version: 2, type: "once", date, time, timezone };
  if (!input.repeat && input.now !== undefined && zonedInstant(date, time, timezone).getTime() <= input.now.getTime()) {
    throw new Error("Choose a future date and time.");
  }
  const definition = {
    id,
    title,
    active: input.active ?? true,
    schedule,
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: deliveryRetryMinutes, snoozeEveryMinutes },
  };
  if (input.repeat) recurrencePreview(definition);
  return definition;
}

export function localeWeekStartsOn(locale = typeof navigator === "undefined" ? "en-US" : navigator.language): string {
  try {
    const value = new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } };
    const firstDay = value.getWeekInfo?.().firstDay ?? value.weekInfo?.firstDay;
    if (firstDay !== undefined) return daysOfWeek[firstDay % 7]!;
  } catch { /* fall through to a stable region fallback */ }
  const region = locale.split("-").find((part) => /^[A-Z]{2}$/.test(part)) ?? "US";
  return new Set(["US", "CA", "JP", "PH"]).has(region) ? "sunday" : "monday";
}

export function recurrencePreview(definition: Record<string, unknown>, limit = 3): RecurrencePreview {
  const schedule = definition.schedule as Record<string, unknown>;
  const start = String(schedule.type === "once" ? schedule.date : schedule.startDate);
  if (schedule.type === "once") return { dates: [start], first: start, last: start, total: 1 };
  const end = schedule.end as Record<string, unknown>;
  const startDate = parseDate(start);
  const horizon = addYears(startDate, 5);
  const finalDate = end.type === "date" && String(end.date) < formatDate(horizon) ? parseDate(String(end.date)) : horizon;
  const desired = end.type === "count" ? Number(end.occurrences) : 366;
  const dates: string[] = [];
  for (let cursor = startDate; compareDate(cursor, finalDate) <= 0 && dates.length < desired; cursor = addDays(cursor, 1)) {
    if (matchesSchedule(schedule, startDate, cursor)) dates.push(formatDate(cursor));
  }
  if (dates.length === 0) throw new Error("This schedule creates no reminders before it ends.");
  if (end.type === "count" && dates.length < Number(end.occurrences)) throw new Error("That many reminders do not fit within the five-year series limit.");
  if (dates.length > 365) throw new Error("A recurring set can contain at most 365 reminders.");
  return { dates: dates.slice(0, Math.max(0, limit)), first: dates[0]!, last: dates.at(-1)!, total: dates.length };
}

export function defaultReminderDate(now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", time = "09:00"): string {
  const parts = localDateParts(now, timezone);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (zonedInstant(today, time, timezone).getTime() > now.getTime()) return today;
  const next = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function recurrenceSummary(definition: Record<string, unknown>): string {
  const schedule = definition.schedule as Record<string, unknown>;
  const preview = recurrencePreview(definition, 1);
  const time = resolvedDisplayTime(preview.first, String(schedule.time), String(schedule.timezone));
  if (schedule.type === "once") return `Once · ${dateLabel(String(schedule.date))} at ${time}`;
  const interval = Number(schedule.interval);
  const cadence = schedule.type === "daily"
    ? interval === 1 ? "Daily" : `Every ${interval} days`
    : schedule.type === "weekly"
      ? `${interval === 1 ? "Weekly" : `Every ${interval} weeks`} on ${(schedule.daysOfWeek as string[]).map(titleCase).join(", ")}`
      : schedule.type === "monthly"
        ? `${interval === 1 ? "Monthly" : `Every ${interval} months`} ${monthlyLabel(schedule.rule as Record<string, unknown>)}`
        : `${interval === 1 ? "Yearly" : `Every ${interval} years`} on ${monthDayLabel(Number(schedule.month), Number(schedule.day))}${Number(schedule.month) === 2 && Number(schedule.day) === 29 ? " (leap years only)" : ""}`;
  const end = schedule.end as Record<string, unknown>;
  return `${cadence} at ${time} · ${end.type === "count" ? `${end.occurrences} reminder${Number(end.occurrences) === 1 ? "" : "s"}` : `ends ${dateLabel(String(end.date))}`}`;
}

function recurringSchedule(input: PulseDefinitionInput, date: string, time: string, timezone: string): Record<string, unknown> {
  const frequency = input.frequency ?? "weekly";
  const maximum = frequency === "daily" ? 365 : frequency === "weekly" ? 52 : frequency === "monthly" ? 60 : 5;
  const interval = wholeNumber(input.interval ?? "1", 1, maximum, `Every must be a whole number from 1 to ${maximum}.`);
  const end = recurrenceEnd(input, date, frequency);
  if (frequency === "daily") return { version: 2, type: frequency, interval, startDate: date, time, timezone, end };
  if (frequency === "weekly") {
    const selected = [...new Set(input.daysOfWeek ?? [dayForDate(date)])];
    if (selected.length === 0 || selected.some((day) => !daysOfWeek.includes(day as typeof daysOfWeek[number]))) throw new Error("Choose at least one weekday.");
    const weekStartsOn = input.weekStartsOn ?? localeWeekStartsOn(input.locale);
    if (!daysOfWeek.includes(weekStartsOn as typeof daysOfWeek[number])) throw new Error("Choose a valid start of week.");
    return { version: 2, type: frequency, interval, startDate: date, weekStartsOn, daysOfWeek: selected, time, timezone, end };
  }
  if (frequency === "monthly") {
    const local = parseDate(date);
    const ruleType = input.monthlyRule ?? "dayOfMonth";
    const rule = ruleType === "nthWeekday"
      ? { type: "nthWeekday", ordinal: input.monthlyOrdinal === "last" ? "last" : Number(input.monthlyOrdinal ?? ordinalForDay(local.day)), day: input.monthlyWeekday ?? dayForDate(date) }
      : { type: "dayOfMonth", day: ruleType === "lastDay" ? 31 : local.day, missingDate: ruleType === "lastDay" ? "lastDay" : "skip" };
    return { version: 2, type: frequency, interval, startDate: date, rule, time, timezone, end };
  }
  const local = parseDate(date);
  return { version: 2, type: frequency, interval, startDate: date, month: local.month, day: local.day, missingDate: "skip", time, timezone, end };
}

function recurrenceEnd(input: PulseDefinitionInput, startDate: string, frequency: Frequency): Record<string, unknown> {
  if ((input.endType ?? "count") === "count") {
    return { type: "count", occurrences: wholeNumber(input.endCount ?? String(recurrenceDefaults[frequency]), 1, 365, "A recurring set must contain 1 to 365 reminders.") };
  }
  const date = validDate(input.endDate ?? "", "Choose a valid series end date.");
  if (date < startDate) throw new Error("The series end date cannot be before its start date.");
  const max = parseDate(startDate); max.year += 5;
  if (date > formatDate(max)) throw new Error("A recurring set must end within five years.");
  return { type: "date", date };
}

function validTime(value: string): string {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid reminder time.");
  const [hour, minute] = value.split(":").map(Number);
  if (hour! > 23 || minute! > 59) throw new Error("Enter a valid reminder time.");
  return value;
}
function validDate(value: string, message: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(message);
  const parsed = parseDate(value);
  const check = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  if (check.getUTCFullYear() !== parsed.year || check.getUTCMonth() + 1 !== parsed.month || check.getUTCDate() !== parsed.day) throw new Error(message);
  return value;
}
function validTimezone(value: string): string { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date()); } catch { throw new Error("Enter a valid IANA time zone."); } return value; }
function wholeNumber(value: string, minimum: number, maximum: number, message: string): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(message); return parsed; }
function dayForDate(value: string): string { const date = parseDate(value); return daysOfWeek[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]!; }
function ordinalForDay(day: number): "1" | "2" | "3" | "4" | "5" { return String(Math.floor((day - 1) / 7) + 1) as "1" | "2" | "3" | "4" | "5"; }
function parseDate(value: string): { year: number; month: number; day: number } { const [year, month, day] = value.split("-").map(Number); return { year: year!, month: month!, day: day! }; }
function formatDate(value: { year: number; month: number; day: number }): string { return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`; }
function localDateParts(value: Date, timezone: string): Record<string, string> { return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value).map((part) => [part.type, part.value])); }
function zonedInstant(date: string, time: string, timezone: string): Date {
  const localDate = parseDate(date);
  const [hour, minute] = time.split(":").map(Number);
  const local = { ...localDate, hour: hour!, minute: minute! };
  const exact = matchingInstants(local, timezone);
  if (exact.length > 0) return exact[0]!;
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const beforeOffset = timezoneOffsetMs(new Date(guess - 12 * 60 * 60_000), timezone);
  const afterOffset = timezoneOffsetMs(new Date(guess + 12 * 60 * 60_000), timezone);
  const gapMinutes = Math.round((afterOffset - beforeOffset) / 60_000);
  if (gapMinutes <= 0 || gapMinutes > 180) throw new Error("Unable to resolve local reminder time.");
  const shifted = addLocalMinutes(local, gapMinutes);
  const shiftedMatches = matchingInstants(shifted, timezone);
  if (shiftedMatches.length === 0) throw new Error("Unable to resolve daylight-saving reminder time.");
  return shiftedMatches[0]!;
}
function matchingInstants(local: { year: number; month: number; day: number; hour: number; minute: number }, timezone: string): Date[] {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const offsets = new Set([-36, -12, 0, 12, 36].map((hours) => timezoneOffsetMs(new Date(guess + hours * 60 * 60_000), timezone)));
  const matches = [...offsets].map((offset) => new Date(guess - offset)).filter((candidate) => {
    const parts = zonedParts(candidate, timezone);
    return parts.year === local.year && parts.month === local.month && parts.day === local.day && parts.hour === local.hour && parts.minute === local.minute;
  });
  return [...new Map(matches.map((value) => [value.getTime(), value])).values()].sort((left, right) => left.getTime() - right.getTime());
}
function zonedParts(value: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}
function timezoneOffsetMs(value: Date, timezone: string): number { const parts = zonedParts(value, timezone); return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(value.getTime() / 60_000) * 60_000; }
function addLocalMinutes(value: { year: number; month: number; day: number; hour: number; minute: number }, amount: number): { year: number; month: number; day: number; hour: number; minute: number } { const date = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute + amount)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes() }; }
function resolvedDisplayTime(date: string, time: string, timezone: string): string { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(zonedInstant(date, time, timezone)); }
function dateLabel(value: string): string { const date = parseDate(value); return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(date.year, date.month - 1, date.day))); }
function monthDayLabel(month: number, day: number): string { return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2028, month - 1, day))); }
function titleCase(value: string): string { return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`; }
function monthlyLabel(rule: Record<string, unknown>): string { if (rule.type === "dayOfMonth") return rule.missingDate === "lastDay" ? "on the last day" : `on day ${rule.day}`; const words = ["", "first", "second", "third", "fourth", "fifth"]; return `on the ${rule.ordinal === "last" ? "last" : words[Number(rule.ordinal)]} ${titleCase(String(rule.day))}${rule.ordinal === 5 ? " (skips months without one)" : ""}`; }

function addDays(value: { year: number; month: number; day: number }, amount: number): { year: number; month: number; day: number } { const date = new Date(Date.UTC(value.year, value.month - 1, value.day + amount)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }
function addYears(value: { year: number; month: number; day: number }, amount: number): { year: number; month: number; day: number } { const target = { ...value, year: value.year + amount }; return target.day <= daysInMonth(target.year, target.month) ? target : { ...target, day: daysInMonth(target.year, target.month) }; }
function compareDate(left: { year: number; month: number; day: number }, right: { year: number; month: number; day: number }): number { return Date.UTC(left.year, left.month - 1, left.day) - Date.UTC(right.year, right.month - 1, right.day); }
function dayIndex(value: { year: number; month: number; day: number }): number { return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay(); }
function daysBetween(left: { year: number; month: number; day: number }, right: { year: number; month: number; day: number }): number { return Math.round(compareDate(right, left) / 86_400_000); }
function daysInMonth(year: number, month: number): number { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function positiveModulo(value: number, divisor: number): number { return (value % divisor + divisor) % divisor; }
function matchesSchedule(schedule: Record<string, unknown>, start: { year: number; month: number; day: number }, candidate: { year: number; month: number; day: number }): boolean {
  const interval = Number(schedule.interval);
  const elapsedDays = daysBetween(start, candidate);
  if (schedule.type === "daily") return elapsedDays % interval === 0;
  if (schedule.type === "weekly") {
    const weekStartIndex = daysOfWeek.indexOf(String(schedule.weekStartsOn) as typeof daysOfWeek[number]);
    const startWeek = addDays(start, -positiveModulo(dayIndex(start) - weekStartIndex, 7));
    const candidateWeek = addDays(candidate, -positiveModulo(dayIndex(candidate) - weekStartIndex, 7));
    return daysBetween(startWeek, candidateWeek) / 7 % interval === 0 && (schedule.daysOfWeek as string[]).includes(daysOfWeek[dayIndex(candidate)]!);
  }
  if (schedule.type === "monthly") {
    const monthDifference = (candidate.year - start.year) * 12 + candidate.month - start.month;
    if (monthDifference % interval !== 0) return false;
    const rule = schedule.rule as Record<string, unknown>;
    if (rule.type === "dayOfMonth") {
      const last = daysInMonth(candidate.year, candidate.month);
      const expected = Number(rule.day) <= last ? Number(rule.day) : rule.missingDate === "lastDay" ? last : -1;
      return candidate.day === expected;
    }
    if (daysOfWeek[dayIndex(candidate)] !== rule.day) return false;
    return rule.ordinal === "last" ? candidate.day + 7 > daysInMonth(candidate.year, candidate.month) : Math.floor((candidate.day - 1) / 7) + 1 === Number(rule.ordinal);
  }
  return (candidate.year - start.year) % interval === 0 && candidate.month === Number(schedule.month) && candidate.day === Number(schedule.day);
}
