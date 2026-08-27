export const MAX_SERIES_OCCURRENCES = 365;
export const MAX_SERIES_YEARS = 5;

export const daysOfWeek = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DayOfWeek = (typeof daysOfWeek)[number];
export type RecurrenceEnd =
  | { type: "count"; occurrences: number }
  | { type: "date"; date: string };

export type OnceSchedule = {
  version: 2;
  type: "once";
  date: string;
  time: string;
  timezone: string;
};

export type DailySchedule = {
  version: 2;
  type: "daily";
  interval: number;
  startDate: string;
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

export type WeeklySchedule = {
  version: 2;
  type: "weekly";
  interval: number;
  startDate: string;
  weekStartsOn: DayOfWeek;
  daysOfWeek: DayOfWeek[];
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

export type MonthlySchedule = {
  version: 2;
  type: "monthly";
  interval: number;
  startDate: string;
  rule:
    | { type: "dayOfMonth"; day: number; missingDate: "skip" | "lastDay" }
    | { type: "nthWeekday"; ordinal: 1 | 2 | 3 | 4 | 5 | "last"; day: DayOfWeek };
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

export type YearlySchedule = {
  version: 2;
  type: "yearly";
  interval: number;
  startDate: string;
  month: number;
  day: number;
  missingDate: "skip";
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

export type PulseScheduleV2 =
  | OnceSchedule
  | DailySchedule
  | WeeklySchedule
  | MonthlySchedule
  | YearlySchedule;

type LocalDate = { year: number; month: number; day: number };
type LocalDateTime = LocalDate & { hour: number; minute: number };

export function parsePulseSchedule(input: unknown): PulseScheduleV2 {
  const value = record(input, "Pulse schedule");
  if (value.version !== 2) throw new Error("Pulse schedule version must be 2.");
  const type = requiredString(value, "type");
  const time = parseTime(requiredString(value, "time"));
  const timezone = requiredString(value, "timezone");
  assertTimezone(timezone);

  if (type === "once") {
    const date = parseDate(requiredString(value, "date"), "One-time schedule date");
    return { version: 2, type, date, time, timezone };
  }

  if (type !== "daily" && type !== "weekly" && type !== "monthly" && type !== "yearly") {
    throw new Error(`Unsupported pulse schedule type: ${type}`);
  }

  const startDate = parseDate(requiredString(value, "startDate"), "Schedule start date");
  const end = parseEnd(value.end, startDate);
  const intervalMaximum = type === "daily" ? 365 : type === "weekly" ? 52 : type === "monthly" ? 60 : 5;
  const interval = integerInRange(value.interval, "Schedule interval", 1, intervalMaximum);

  if (type === "daily") return enforceOccurrenceLimit({ version: 2, type, interval, startDate, time, timezone, end });

  if (type === "weekly") {
    const rawDays = value.daysOfWeek;
    if (!Array.isArray(rawDays) || rawDays.length === 0) {
      throw new Error("Weekly schedules require at least one weekday.");
    }
    const parsedDays = rawDays.map(parseDay);
    const uniqueDays = [...new Set(parsedDays)];
    if (uniqueDays.length !== parsedDays.length) throw new Error("Weekly schedule weekdays must be unique.");
    return enforceOccurrenceLimit({
      version: 2,
      type,
      interval,
      startDate,
      weekStartsOn: parseDay(value.weekStartsOn),
      daysOfWeek: uniqueDays,
      time,
      timezone,
      end,
    });
  }

  if (type === "monthly") {
    const ruleValue = record(value.rule, "Monthly schedule rule");
    const ruleType = requiredString(ruleValue, "type");
    if (ruleType === "dayOfMonth") {
      const day = integerInRange(ruleValue.day, "Monthly day", 1, 31);
      if (ruleValue.missingDate !== "skip" && ruleValue.missingDate !== "lastDay") {
        throw new Error("Monthly missing-date behavior must be skip or lastDay.");
      }
      return enforceOccurrenceLimit({
        version: 2,
        type,
        interval,
        startDate,
        rule: { type: ruleType, day, missingDate: ruleValue.missingDate },
        time,
        timezone,
        end,
      });
    }
    if (ruleType === "nthWeekday") {
      const ordinal = ruleValue.ordinal;
      if (ordinal !== "last" && ordinal !== 1 && ordinal !== 2 && ordinal !== 3 && ordinal !== 4 && ordinal !== 5) {
        throw new Error("Monthly weekday ordinal must be 1–5 or last.");
      }
      return enforceOccurrenceLimit({
        version: 2,
        type,
        interval,
        startDate,
        rule: { type: ruleType, ordinal, day: parseDay(ruleValue.day) },
        time,
        timezone,
        end,
      });
    }
    throw new Error("Monthly schedule rule must be dayOfMonth or nthWeekday.");
  }

  const month = integerInRange(value.month, "Yearly month", 1, 12);
  const day = integerInRange(value.day, "Yearly day", 1, 31);
  if (!validDate({ year: leapReferenceYear(month, day), month, day })) {
    throw new Error("Yearly schedule month and day must form a real calendar date.");
  }
  if (value.missingDate !== "skip") throw new Error("Yearly missing-date behavior must be skip.");
  return enforceOccurrenceLimit({ version: 2, type, interval, startDate, month, day, missingDate: "skip", time, timezone, end });
}

function enforceOccurrenceLimit<T extends Exclude<PulseScheduleV2, OnceSchedule>>(schedule: T): T {
  if (schedule.end.type === "count") {
    const generated = enumerateSchedule(schedule, true, schedule.end.occurrences).length;
    if (generated < schedule.end.occurrences) throw new Error("The requested occurrence count does not fit within the five-year series limit.");
  } else if (enumerateSchedule(schedule, false, MAX_SERIES_OCCURRENCES + 1).length > MAX_SERIES_OCCURRENCES) {
    throw new Error(`A recurring series may contain at most ${MAX_SERIES_OCCURRENCES} occurrences.`);
  }
  return schedule;
}

export function previewSchedule(
  schedule: PulseScheduleV2,
  options: { limit?: number; after?: Date } = {},
): string[] {
  const limit = Math.max(0, Math.min(options.limit ?? 3, MAX_SERIES_OCCURRENCES));
  const after = options.after?.getTime() ?? Number.NEGATIVE_INFINITY;
  return enumerateSchedule(schedule, true)
    .filter((instant) => instant.getTime() > after)
    .slice(0, limit)
    .map((instant) => instant.toISOString());
}

export function scheduleInstants(
  schedule: PulseScheduleV2,
  options: { respectCount?: boolean } = {},
): Date[] {
  return enumerateSchedule(schedule, options.respectCount ?? true);
}

export function scheduleSummary(schedule: PulseScheduleV2): string {
  const first = enumerateSchedule(schedule, true)[0];
  if (schedule.type === "once") {
    if (!first) return "Once";
    const date = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(first);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(first);
    return `Once · ${date} at ${time}`;
  }
  const cadence = schedule.type === "daily"
    ? schedule.interval === 1 ? "Daily" : `Every ${schedule.interval} days`
    : schedule.type === "weekly"
      ? `${schedule.interval === 1 ? "Weekly" : `Every ${schedule.interval} weeks`} on ${schedule.daysOfWeek.map(titleCase).join(", ")}`
      : schedule.type === "monthly"
        ? `${schedule.interval === 1 ? "Monthly" : `Every ${schedule.interval} months`} ${monthlyRuleSummary(schedule.rule)}`
        : `${schedule.interval === 1 ? "Yearly" : `Every ${schedule.interval} years`} on ${monthDayLabel(schedule.month, schedule.day)}`;
  const ending = schedule.end.type === "count"
    ? `${schedule.end.occurrences} reminder${schedule.end.occurrences === 1 ? "" : "s"}`
    : `ends ${dateLabel(schedule.end.date)}`;
  return `${cadence} at ${displayTime(schedule.time)} · ${ending}`;
}

function enumerateSchedule(schedule: PulseScheduleV2, respectCount: boolean, absoluteMaximum = MAX_SERIES_OCCURRENCES): Date[] {
  const startDate = parseLocalDate(schedule.type === "once" ? schedule.date : schedule.startDate);
  const horizon = addYears(startDate, MAX_SERIES_YEARS);
  const endDate = schedule.type === "once" || schedule.end.type === "count"
    ? horizon
    : parseLocalDate(schedule.end.date);
  const finalDate = compareLocalDate(endDate, horizon) < 0 ? endDate : horizon;
  const [hour, minute] = schedule.time.split(":").map(Number) as [number, number];
  const maximum = schedule.type === "once"
    ? 1
    : respectCount && schedule.end.type === "count"
      ? Math.min(schedule.end.occurrences, absoluteMaximum)
      : absoluteMaximum;
  const results: Date[] = [];

  for (let cursor = startDate; compareLocalDate(cursor, finalDate) <= 0 && results.length < maximum; cursor = addDays(cursor, 1)) {
    if (!matchesSchedule(schedule, startDate, cursor)) continue;
    results.push(resolveZonedLocalTime({ ...cursor, hour, minute }, schedule.timezone));
  }
  return results;
}

function matchesSchedule(schedule: PulseScheduleV2, start: LocalDate, candidate: LocalDate): boolean {
  if (schedule.type === "once") return compareLocalDate(start, candidate) === 0;
  const days = daysBetween(start, candidate);
  if (days < 0) return false;
  if (schedule.type === "daily") return days % schedule.interval === 0;
  if (schedule.type === "weekly") {
    const weekStartIndex = daysOfWeek.indexOf(schedule.weekStartsOn);
    const startWeek = addDays(start, -positiveModulo(dayIndex(start) - weekStartIndex, 7));
    const candidateWeek = addDays(candidate, -positiveModulo(dayIndex(candidate) - weekStartIndex, 7));
    const weekDifference = daysBetween(startWeek, candidateWeek) / 7;
    return weekDifference % schedule.interval === 0 && schedule.daysOfWeek.includes(daysOfWeek[dayIndex(candidate)]!);
  }
  if (schedule.type === "monthly") {
    const monthDifference = (candidate.year - start.year) * 12 + candidate.month - start.month;
    if (monthDifference % schedule.interval !== 0) return false;
    if (schedule.rule.type === "dayOfMonth") {
      const lastDay = daysInMonth(candidate.year, candidate.month);
      const expected = schedule.rule.day <= lastDay
        ? schedule.rule.day
        : schedule.rule.missingDate === "lastDay" ? lastDay : -1;
      return candidate.day === expected;
    }
    if (dayIndex(candidate) !== daysOfWeek.indexOf(schedule.rule.day)) return false;
    if (schedule.rule.ordinal === "last") return candidate.day + 7 > daysInMonth(candidate.year, candidate.month);
    return Math.floor((candidate.day - 1) / 7) + 1 === schedule.rule.ordinal;
  }
  return (candidate.year - start.year) % schedule.interval === 0
    && candidate.month === schedule.month
    && candidate.day === schedule.day;
}

/** Resolve a wall-clock time without letting the host machine timezone leak in.
 * Ambiguous fall-back times select the earlier instant. Missing spring times
 * advance by the transition gap, preserving minutes within the hour. */
export function resolveZonedLocalTime(local: LocalDateTime, timezone: string): Date {
  const exact = matchingInstants(local, timezone);
  if (exact.length > 0) return exact[0]!;

  const targetGuess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const beforeOffset = timezoneOffsetMs(new Date(targetGuess - 12 * 60 * 60_000), timezone);
  const afterOffset = timezoneOffsetMs(new Date(targetGuess + 12 * 60 * 60_000), timezone);
  const gapMinutes = Math.round((afterOffset - beforeOffset) / 60_000);
  if (gapMinutes <= 0 || gapMinutes > 180) throw new Error("Unable to resolve local schedule time.");
  const shifted = addLocalMinutes(local, gapMinutes);
  const shiftedMatches = matchingInstants(shifted, timezone);
  if (shiftedMatches.length === 0) throw new Error("Unable to resolve daylight-saving schedule time.");
  return shiftedMatches[0]!;
}

function matchingInstants(local: LocalDateTime, timezone: string): Date[] {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const offsets = new Set([
    timezoneOffsetMs(new Date(guess - 36 * 60 * 60_000), timezone),
    timezoneOffsetMs(new Date(guess - 12 * 60 * 60_000), timezone),
    timezoneOffsetMs(new Date(guess), timezone),
    timezoneOffsetMs(new Date(guess + 12 * 60 * 60_000), timezone),
    timezoneOffsetMs(new Date(guess + 36 * 60 * 60_000), timezone),
  ]);
  const matches: Date[] = [];
  for (const offset of offsets) {
    const candidate = new Date(guess - offset);
    const parts = zonedParts(candidate, timezone);
    if (
      parts.year === local.year && parts.month === local.month && parts.day === local.day
      && parts.hour === local.hour && parts.minute === local.minute
    ) matches.push(candidate);
  }
  return [...new Map(matches.map((value) => [value.getTime(), value])).values()]
    .sort((left, right) => left.getTime() - right.getTime());
}

function parseEnd(input: unknown, startDate: string): RecurrenceEnd {
  if (input === undefined) throw new Error("Recurring schedules require a finite end.");
  const value = record(input, "Recurrence end");
  if (value.type === "count") {
    return { type: "count", occurrences: integerInRange(value.occurrences, "Recurrence count", 1, MAX_SERIES_OCCURRENCES, "Recurring series must contain 365 or fewer reminders.") };
  }
  if (value.type === "date") {
    const date = parseDate(requiredString(value, "date"), "Recurrence end date");
    if (date < startDate) throw new Error("Recurrence end date cannot be before the start date.");
    if (compareLocalDate(parseLocalDate(date), addYears(parseLocalDate(startDate), MAX_SERIES_YEARS)) > 0) {
      throw new Error("Recurring series must end within five years.");
    }
    return { type: "date", date };
  }
  throw new Error("Recurring schedules require a finite end by count or date.");
}

function parseTime(value: string): string {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("Schedule time must use HH:mm.");
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  if (hour > 23 || minute > 59) throw new Error("Schedule time is out of range.");
  return value;
}

function parseDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !validDate(parseLocalDate(value))) {
    throw new Error(`${label} must use YYYY-MM-DD and be a real date.`);
  }
  return value;
}

function parseLocalDate(value: string): LocalDate {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

function validDate(value: LocalDate): boolean {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return date.getUTCFullYear() === value.year && date.getUTCMonth() + 1 === value.month && date.getUTCDate() === value.day;
}

function addDays(value: LocalDate, amount: number): LocalDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function addYears(value: LocalDate, amount: number): LocalDate {
  const target = { year: value.year + amount, month: value.month, day: value.day };
  if (validDate(target)) return target;
  return { year: target.year, month: target.month, day: daysInMonth(target.year, target.month) };
}

function addLocalMinutes(value: LocalDateTime, minutes: number): LocalDateTime {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute + minutes));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function daysBetween(left: LocalDate, right: LocalDate): number {
  return (Date.UTC(right.year, right.month - 1, right.day) - Date.UTC(left.year, left.month - 1, left.day)) / 86_400_000;
}

function compareLocalDate(left: LocalDate, right: LocalDate): number {
  return Date.UTC(left.year, left.month - 1, left.day) - Date.UTC(right.year, right.month - 1, right.day);
}

function dayIndex(value: LocalDate): number {
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function zonedParts(date: Date, timezone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = zonedParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(date.getTime() / 60_000) * 60_000;
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch {
    throw new Error("Schedule timezone must be a valid IANA time zone.");
  }
}

function parseDay(input: unknown): DayOfWeek {
  if (typeof input !== "string" || !daysOfWeek.includes(input.toLowerCase() as DayOfWeek)) {
    throw new Error(`Unsupported day of week: ${String(input)}`);
  }
  return input.toLowerCase() as DayOfWeek;
}

function integerInRange(input: unknown, label: string, minimum: number, maximum: number, customError?: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < minimum || input > maximum) {
    throw new Error(customError ?? `${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return input;
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error(`${label} must be an object.`);
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${key} must be a non-empty string.`);
  return value;
}

function leapReferenceYear(month: number, day: number): number {
  return month === 2 && day === 29 ? 2028 : 2026;
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function displayTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function monthlyRuleSummary(rule: MonthlySchedule["rule"]): string {
  if (rule.type === "dayOfMonth") return rule.missingDate === "lastDay" ? "on the last day" : `on day ${rule.day}`;
  const ordinal = rule.ordinal === "last" ? "last" : ["", "first", "second", "third", "fourth", "fifth"][rule.ordinal];
  return `on the ${ordinal} ${titleCase(rule.day)}`;
}

function monthDayLabel(month: number, day: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2028, month - 1, day)));
}

function dateLabel(value: string): string {
  const date = parseLocalDate(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}
