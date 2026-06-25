export type PulsePhase = {
  id: number;
  name: string;
  status: "not_started" | "complete";
};

export const phaseZero: PulsePhase = {
  id: 0,
  name: "Project shape",
  status: "complete",
};

export const publicPrivateBoundary =
  "The public repo gives you the Pulse engine. Your private runner deployment owns your real obligations, credentials, and completion history.";

export {
  applyOccurrenceAction,
  completeOccurrence,
  createPulseEvent,
  generateNextOccurrence,
  generateOccurrences,
  isOccurrenceDue,
  loadPulseDefinitionsFromYaml,
  markOccurrenceDue,
  parsePulseDefinitions,
} from "./model.js";
export { createEmptyPulseState, createJsonPulseStateStore, getPulseEnvConfig, loadPrivatePulseConfig } from "./storage.js";

export type {
  DayOfWeek,
  GenerateOccurrenceOptions,
  NotificationPolicy,
  OccurrenceAction,
  PulseDefinition,
  PulseEvent,
  PulseEventType,
  PulseOccurrence,
  PulseSchedule,
  WeeklyPulseSchedule,
} from "./model.js";

export type { PrivatePulseConfig, PulseEnvConfig, PulseState, PulseStateStore } from "./storage.js";
