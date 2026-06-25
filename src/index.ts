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
  createConsoleNotificationAdapter,
  createNotificationDispatcherFromEnv,
  createTwilioSmsNotificationAdapter,
  createTwilioSmsTransport,
} from "./adapters.js";
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
export { createPollingRunner, redactNotificationDetail, runPulseRunnerTick } from "./runner.js";
export { validatePulseReleaseReadiness } from "./release.js";
export {
  copyPrivateFileBackup,
  createPulseBackup,
  createEmptyPulseState,
  createJsonPulseStateStore,
  createMemoryPulseStateStore,
  exportPulseState,
  getPulseEnvConfig,
  importPulseState,
  loadPrivatePulseConfig,
  migratePulseState,
  parsePulseState,
  restorePulseBackup,
} from "./storage.js";
export { createPulseUiServer, renderPulseManagementPage } from "./ui.js";

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
export type { PulseReleaseReadinessResult } from "./release.js";
export type {
  ConsoleNotificationWriter,
  FetchLike,
  FetchResponse,
  NotificationDispatcherFromEnvOptions,
  NotificationEnv,
  SmsMessage,
  SmsTransport,
  TwilioSmsAdapterOptions,
  TwilioSmsTransportOptions,
} from "./adapters.js";
export type {
  NotificationDispatcher,
  NotificationInput,
  NotificationResult,
  PulsePollingRunnerInput,
  PulseRunnerTickInput,
  PulseRunnerTickResult,
} from "./runner.js";
export type {
  PulseManagementPageInput,
  PulseUiListenInput,
  PulseUiRunnerHealth,
  PulseUiServer,
  PulseUiServerInput,
} from "./ui.js";
