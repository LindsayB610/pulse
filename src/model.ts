import { parse } from "yaml";

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

export type WeeklyPulseSchedule = {
  type: "weekly";
  daysOfWeek: DayOfWeek[];
  time: string;
  timezone: string;
};

export type PulseSchedule = WeeklyPulseSchedule;

export type NotificationPolicy = {
  channels: string[];
  repeatEveryMinutes: number;
};

export type PulseDefinition = {
  id: string;
  title: string;
  active: boolean;
  schedule: PulseSchedule;
  instructions?: string;
  notificationPolicy?: NotificationPolicy;
};

export type PulseOccurrence = {
  id: string;
  pulseId: string;
  dueAt: string;
  state: "scheduled" | "due" | "done";
  completedAt?: string;
  completionNote?: string;
};

export type OccurrenceAction =
  | {
      type: "done";
      at: Date;
      completionNote?: string;
    }
  | {
      type: "snooze" | "dismiss" | "skip" | "seen";
      at: Date;
    };

export type PulseEventType =
  | "pulse_created"
  | "occurrence_scheduled"
  | "occurrence_became_due"
  | "notification_sent"
  | "occurrence_completed";

export type PulseEvent = {
  id: string;
  pulseId: string;
  occurrenceId?: string;
  type: PulseEventType;
  at: string;
  metadata?: Record<string, unknown>;
};

export type GenerateOccurrenceOptions = {
  after: Date;
  existingOccurrences?: PulseOccurrence[];
};

type PulseConfigFile = {
  pulses?: unknown;
};

export function loadPulseDefinitionsFromYaml(yamlText: string): PulseDefinition[] {
  const document = parse(yamlText) as PulseConfigFile;
  if (!document || !Array.isArray(document.pulses)) {
    throw new Error("Pulse config must include a pulses array.");
  }

  return parsePulseDefinitions(document.pulses);
}

export function parsePulseDefinitions(input: unknown): PulseDefinition[] {
  if (!Array.isArray(input)) {
    throw new Error("Pulse definitions must be an array.");
  }

  return input.map(parsePulseDefinition);
}

export function generateOccurrences(
  pulses: PulseDefinition[],
  options: GenerateOccurrenceOptions,
): PulseOccurrence[] {
  return pulses.flatMap((pulse) => {
    const occurrence = generateNextOccurrence(pulse, options);
    return occurrence ? [occurrence] : [];
  });
}

export function generateNextOccurrence(
  pulse: PulseDefinition,
  options: GenerateOccurrenceOptions,
): PulseOccurrence | null {
  if (!pulse.active) {
    return null;
  }

  const nextDueAt = nextWeeklyDueAt(
    pulse.schedule,
    options.after,
    new Set(
      options.existingOccurrences
        ?.filter((occurrence) => occurrence.pulseId === pulse.id)
        .map((occurrence) => occurrence.id) ?? [],
    ),
    pulse.id,
  );
  const dueAt = nextDueAt.toISOString();
  const id = occurrenceId(pulse.id, dueAt);

  return {
    id,
    pulseId: pulse.id,
    dueAt,
    state: "scheduled",
  };
}

export function createPulseEvent(input: {
  pulseId: string;
  occurrenceId?: string;
  type: PulseEventType;
  at: Date;
  metadata?: Record<string, unknown>;
}): PulseEvent {
  const at = input.at.toISOString();
  const occurrenceSegment = input.occurrenceId ?? "pulse";
  const event: PulseEvent = {
    id: `evt:${occurrenceSegment}:${input.type}:${at}`,
    pulseId: input.pulseId,
    type: input.type,
    at,
  };

  if (input.occurrenceId !== undefined) {
    event.occurrenceId = input.occurrenceId;
  }
  if (input.metadata !== undefined) {
    event.metadata = input.metadata;
  }

  return event;
}

export function isOccurrenceDue(occurrence: PulseOccurrence, now: Date): boolean {
  return occurrence.state === "scheduled" && Date.parse(occurrence.dueAt) <= now.getTime();
}

export function markOccurrenceDue(occurrence: PulseOccurrence, now: Date): PulseOccurrence {
  if (occurrence.state === "done") {
    throw new Error("Done occurrences cannot become due again.");
  }
  if (occurrence.state === "due" || !isOccurrenceDue(occurrence, now)) {
    return occurrence;
  }

  return {
    ...occurrence,
    state: "due",
  };
}

export function completeOccurrence(
  occurrence: PulseOccurrence,
  input: { completedAt: Date; completionNote?: string },
): PulseOccurrence {
  if (occurrence.state !== "due") {
    throw new Error("Only due occurrences can be completed.");
  }

  const completed: PulseOccurrence = {
    ...occurrence,
    state: "done",
    completedAt: input.completedAt.toISOString(),
  };

  if (input.completionNote !== undefined) {
    completed.completionNote = input.completionNote;
  }

  return completed;
}

export function applyOccurrenceAction(
  occurrence: PulseOccurrence,
  action: OccurrenceAction,
): PulseOccurrence {
  if (action.type !== "done") {
    throw new Error(`Unsupported occurrence action: ${action.type}. Mark Done to stop an active pulse.`);
  }

  const completionInput: { completedAt: Date; completionNote?: string } = {
    completedAt: action.at,
  };
  if (action.completionNote !== undefined) {
    completionInput.completionNote = action.completionNote;
  }

  return completeOccurrence(occurrence, completionInput);
}

function parsePulseDefinition(input: unknown): PulseDefinition {
  if (!isRecord(input)) {
    throw new Error("Pulse definition must be an object.");
  }

  const id = requiredString(input, "id");
  const title = requiredString(input, "title");
  const active = requiredBoolean(input, "active");
  const schedule = parseSchedule(input.schedule);
  const instructions =
    input.instructions === undefined ? undefined : stringValue(input.instructions, "instructions");
  const notificationPolicy =
    input.notificationPolicy === undefined
      ? undefined
      : parseNotificationPolicy(input.notificationPolicy);

  const pulse: PulseDefinition = {
    id,
    title,
    active,
    schedule,
  };

  if (instructions !== undefined) {
    pulse.instructions = instructions;
  }
  if (notificationPolicy !== undefined) {
    pulse.notificationPolicy = notificationPolicy;
  }

  return pulse;
}

function parseSchedule(input: unknown): PulseSchedule {
  if (!isRecord(input)) {
    throw new Error("Pulse schedule must be an object.");
  }

  const type = requiredString(input, "type");
  if (type !== "weekly") {
    throw new Error(`Unsupported pulse schedule type: ${type}`);
  }

  const days = input.daysOfWeek;
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error("Weekly pulse schedule must include daysOfWeek.");
  }

  const parsedDays = days.map((day) => parseDayOfWeek(day));
  const time = requiredString(input, "time");
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Weekly pulse schedule time must use HH:mm.");
  }
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error("Weekly pulse schedule time is out of range.");
  }

  const timezone = requiredString(input, "timezone");
  assertValidTimezone(timezone);

  return {
    type,
    daysOfWeek: parsedDays,
    time,
    timezone,
  };
}

function parseNotificationPolicy(input: unknown): NotificationPolicy {
  if (!isRecord(input)) {
    throw new Error("Notification policy must be an object.");
  }

  const channels = input.channels;
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("Notification policy must include channels.");
  }

  return {
    channels: channels.map((channel) => stringValue(channel, "notification channel")),
    repeatEveryMinutes: requiredNumber(input, "repeatEveryMinutes"),
  };
}

function parseDayOfWeek(input: unknown): DayOfWeek {
  const value = stringValue(input, "day of week").toLowerCase();
  if (!daysOfWeek.includes(value as DayOfWeek)) {
    throw new Error(`Unsupported day of week: ${value}`);
  }

  return value as DayOfWeek;
}

function assertValidTimezone(timezone: string): void {
  new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
}

function nextWeeklyDueAt(
  schedule: WeeklyPulseSchedule,
  after: Date,
  existingOccurrenceIds: Set<string>,
  pulseId: string,
): Date {
  const afterParts = zonedParts(after, schedule.timezone);
  const [hour, minute] = schedule.time.split(":").map(Number);
  const scheduledDayIndexes = [...new Set(schedule.daysOfWeek.map((day) => daysOfWeek.indexOf(day)))]
    .sort((a, b) => a - b);

  for (let offset = 0; offset <= 370; offset += 1) {
    const candidateLocalDate = addDaysLocalDate(
      {
        year: afterParts.year,
        month: afterParts.month,
        day: afterParts.day,
      },
      offset,
    );
    const candidateDay = dayOfWeekForLocalDate(candidateLocalDate);
    if (!scheduledDayIndexes.includes(candidateDay)) {
      continue;
    }

    const candidate = zonedLocalTimeToUtc({
      ...candidateLocalDate,
      hour,
      minute,
      second: 0,
      millisecond: 0,
      timezone: schedule.timezone,
    });

    if (candidate.getTime() > after.getTime()) {
      const dueAt = candidate.toISOString();
      if (!existingOccurrenceIds.has(occurrenceId(pulseId, dueAt))) {
        return candidate;
      }
    }
  }

  throw new Error("Unable to generate next weekly occurrence.");
}

function occurrenceId(pulseId: string, dueAt: string): string {
  return `${pulseId}:${dueAt}`;
}

function zonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zonedLocalTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  timezone: string;
}): Date {
  let utc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second,
    input.millisecond,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = timezoneOffsetMs(new Date(utc), input.timezone);
    utc =
      Date.UTC(
        input.year,
        input.month - 1,
        input.day,
        input.hour,
        input.minute,
        input.second,
        input.millisecond,
      ) - offset;
  }

  return new Date(utc);
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = zonedParts(date, timezone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );

  return localAsUtc - date.getTime();
}

function addDaysLocalDate(
  input: { year: number; month: number; day: number },
  daysToAdd: number,
): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(input.year, input.month - 1, input.day + daysToAdd));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function dayOfWeekForLocalDate(input: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(input.year, input.month - 1, input.day)).getUTCDay();
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function requiredString(input: Record<string, unknown>, key: string): string {
  return stringValue(input[key], key);
}

function stringValue(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return input;
}

function requiredBoolean(input: Record<string, unknown>, key: string): boolean {
  if (typeof input[key] !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }

  return input[key];
}

function requiredNumber(input: Record<string, unknown>, key: string): number {
  if (typeof input[key] !== "number" || !Number.isFinite(input[key])) {
    throw new Error(`${key} must be a finite number.`);
  }

  return input[key];
}
