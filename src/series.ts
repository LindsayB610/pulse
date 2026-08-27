import {
  generateNextOccurrence,
  type PulseDefinition,
  type PulseOccurrence,
  type WeeklyPulseSchedule,
} from "./model.js";
import { parsePulseSchedule, scheduleInstants, type DayOfWeek, type RecurrenceEnd } from "./recurrence.js";
import type { PulseState } from "./storage.js";

export type LegacyRecurrenceClassification =
  | { id: string; mode: "once" }
  | { id: string; mode: "repeat"; end?: RecurrenceEnd; weekStartsOn?: DayOfWeek };

export type LegacyRecurrenceMigrationInput = {
  pulses: PulseDefinition[];
  state: PulseState;
  classifications: LegacyRecurrenceClassification[];
  now: Date;
};

export type SeriesProgress = {
  generated: number;
  remaining?: number;
  endsOn?: string;
  complete: boolean;
};

export function canonicalCreateDefinition(draft: PulseDefinition, now: Date = new Date()): PulseDefinition {
  if (!("version" in draft.schedule) || draft.schedule.version !== 2) {
    throw new Error("New reminders must use bounded schedule version 2.");
  }
  if (draft.schedule.type === "once" && (scheduleInstants(draft.schedule)[0]?.getTime() ?? 0) <= now.getTime()) {
    throw new Error("One-time reminders must be scheduled in the future.");
  }
  return { ...draft, definitionRevision: 1, seriesRevision: 1 };
}

export function canonicalUpdateDefinition(
  current: PulseDefinition,
  draft: PulseDefinition,
  expectedRevision: number,
): PulseDefinition {
  if (current.definitionRevision !== expectedRevision) {
    throw new Error(`Definition revision conflict. Current revision is ${current.definitionRevision ?? 1}.`);
  }
  if (!("version" in draft.schedule) || draft.schedule.version !== 2) {
    throw new Error("Updated reminders must use bounded schedule version 2.");
  }
  const scheduleChanged = stableJson(current.schedule) !== stableJson(draft.schedule);
  return {
    ...draft,
    definitionRevision: (current.definitionRevision ?? 1) + 1,
    seriesRevision: (current.seriesRevision ?? 1) + (scheduleChanged ? 1 : 0),
  };
}

/** Preserve acknowledged work across a series edit without letting a
 * once/recurring conversion generate a duplicate after the open item is Done. */
export function adoptOpenOccurrenceForSeriesConversion(
  state: PulseState,
  current: PulseDefinition,
  next: PulseDefinition,
): void {
  if ((current.seriesRevision ?? 1) === (next.seriesRevision ?? 1)) return;
  const currentIsOnce = "version" in current.schedule && current.schedule.version === 2 && current.schedule.type === "once";
  const nextIsV2 = "version" in next.schedule && next.schedule.version === 2;
  const nextIsOnce = nextIsV2 && next.schedule.type === "once";
  if (!currentIsOnce && !nextIsOnce) return;
  const open = state.occurrences.find((occurrence) => occurrence.pulseId === current.id && occurrence.state !== "done");
  if (!open || open.state === "scheduled" && open.snoozedAt === undefined) return;
  open.seriesRevision = next.seriesRevision ?? 1;
  open.ordinal = 1;
  let final = nextIsOnce;
  if ("version" in next.schedule && next.schedule.version === 2 && next.schedule.type !== "once") {
    final ||= next.schedule.end.type === "count" && next.schedule.end.occurrences === 1;
  }
  open.final = final;
}

export function seriesProgress(pulse: PulseDefinition, occurrences: PulseOccurrence[], now: Date = new Date()): SeriesProgress {
  const revision = pulse.seriesRevision ?? 1;
  const series = occurrences.filter((occurrence) => occurrence.pulseId === pulse.id && (occurrence.seriesRevision ?? revision) === revision);
  const generated = series.length;
  const open = series.some((occurrence) => occurrence.state !== "done");
  const schedule = pulse.schedule;
  if (!("version" in schedule) || schedule.version !== 2) return { generated, complete: false };
  if (schedule.type === "once") return { generated, complete: generated > 0 && !open };
  if (schedule.end.type === "count") {
    const remaining = Math.max(0, schedule.end.occurrences - generated);
    return { generated, remaining, complete: remaining === 0 && !open };
  }
  const lastEligible = scheduleInstants(schedule).at(-1);
  return {
    generated,
    endsOn: schedule.end.date,
    complete: !open && lastEligible !== undefined && lastEligible.getTime() <= now.getTime(),
  };
}

export function recurrenceMigrationRequired(pulses: PulseDefinition[]): boolean {
  return pulses.some((pulse) => !("version" in pulse.schedule) || pulse.schedule.version !== 2);
}

export function migrateLegacyRecurrence(input: LegacyRecurrenceMigrationInput): {
  pulses: PulseDefinition[];
  state: PulseState;
} {
  const legacy = input.pulses.filter((pulse) => !("version" in pulse.schedule) || pulse.schedule.version !== 2);
  if (legacy.length === 0) throw new Error("Pulse already uses bounded recurrence.");
  if (legacy.length !== input.pulses.length) throw new Error("A mixed legacy and bounded definition set cannot be migrated partially.");
  const byId = new Map<string, LegacyRecurrenceClassification>();
  for (const classification of input.classifications) {
    if (byId.has(classification.id)) throw new Error("Classify every legacy reminder exactly once.");
    byId.set(classification.id, classification);
  }
  if (byId.size !== legacy.length || legacy.some((pulse) => !byId.has(pulse.id))) {
    throw new Error("Classify every legacy reminder before finishing the update.");
  }

  const nextState: PulseState = {
    version: 2,
    occurrences: input.state.occurrences.map((occurrence) => ({ ...occurrence })),
    events: input.state.events.map((event) => ({ ...event, ...(event.metadata === undefined ? {} : { metadata: { ...event.metadata } }) })),
    ...(input.state.pendingNotificationSequenceCleanups === undefined ? {} : {
      pendingNotificationSequenceCleanups: input.state.pendingNotificationSequenceCleanups.map((cleanup) => ({ ...cleanup })),
    }),
  };
  const migrated = legacy.map((pulse) => {
    const legacySchedule = pulse.schedule as WeeklyPulseSchedule;
    const classification = byId.get(pulse.id)!;
    const open = nextState.occurrences
      .filter((occurrence) => occurrence.pulseId === pulse.id && occurrence.state !== "done")
      .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))[0];
    const legacyNext = open ?? generateNextOccurrence(pulse, {
      after: input.now,
      existingOccurrences: nextState.occurrences,
      includeMissed: true,
    });
    if (!legacyNext) throw new Error(`Legacy reminder ${pulse.id} has no schedulable occurrence.`);
    const localDateTime = dateTimeInZone(legacyNext.dueAt, legacySchedule.timezone);
    const schedule = classification.mode === "once"
      ? parsePulseSchedule({
          version: 2,
          type: "once",
          date: localDateTime.date,
          time: localDateTime.time,
          timezone: legacySchedule.timezone,
        })
      : parsePulseSchedule({
          version: 2,
          type: "weekly",
          interval: 1,
          startDate: localDateTime.date,
          weekStartsOn: classification.weekStartsOn ?? "sunday",
          daysOfWeek: legacySchedule.daysOfWeek,
          time: legacySchedule.time,
          timezone: legacySchedule.timezone,
          end: classification.end ?? { type: "count", occurrences: 30 },
        });
    const definition: PulseDefinition = {
      ...pulse,
      schedule,
      definitionRevision: 1,
      seriesRevision: 1,
    };
    const adopted: PulseOccurrence = {
      ...legacyNext,
      seriesRevision: 1,
      ordinal: 1,
      final: classification.mode === "once"
        || classification.mode === "repeat" && (classification.end?.type ?? "count") === "count"
          && (classification.end?.type === "count" ? classification.end.occurrences : 30) === 1,
      titleSnapshot: pulse.title,
    };
    if (open) {
      nextState.occurrences = nextState.occurrences
        .filter((occurrence) => occurrence.pulseId !== pulse.id || occurrence.state === "done" || occurrence.id === open.id)
        .map((occurrence) => occurrence.id === open.id ? adopted : occurrence);
    } else {
      nextState.occurrences.push(adopted);
    }
    nextState.occurrences = nextState.occurrences.map((occurrence) => occurrence.pulseId === pulse.id && occurrence.state === "done" && occurrence.titleSnapshot === undefined
      ? { ...occurrence, titleSnapshot: pulse.title }
      : occurrence);
    return definition;
  });

  return { pulses: migrated, state: nextState };
}

function dateTimeInZone(iso: string, timezone: string): { date: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
