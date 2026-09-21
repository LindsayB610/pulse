import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { loadPulseDefinitionsFromYaml, type PulseDefinition, type PulseEvent, type PulseOccurrence } from "./model.js";
import { isPulseNtfySequenceId } from "./ntfy-sequence.js";

export type PrivatePulseConfig = {
  path: string;
  pulses: PulseDefinition[];
};

export type PulseState = {
  version: 1 | 2;
  occurrences: PulseOccurrence[];
  events: PulseEvent[];
  pendingNotificationSequenceCleanups?: PulsePendingNotificationCleanup[];
};

export type PulsePendingNotificationCleanup = {
  pulseId: string;
  occurrenceId: string;
  sequenceId: string;
  requestedAt: string;
  titleSnapshot: string;
};

export type PulseStateStore = {
  read(): PulseState;
  write(state: PulseState): void;
  withExclusive<T>(operation: () => Promise<T> | T): Promise<T>;
};

export type PulseBackupInput = {
  statePath: string;
  backupDir: string;
  now?: Date;
};

export type PulseBackupResult = {
  path: string;
  state: PulseState;
};

export type PulseRestoreInput = {
  backupPath: string;
  statePath: string;
};

export type PulseEnvConfig = {
  configPath?: string;
  statePath?: string;
  timezone?: string;
  secrets: Record<string, string>;
  recipients: Record<string, string>;
};

const secretEnvKeys = ["PULSE_NTFY_TOKEN", "PULSE_API_TOKEN"];
const recipientEnvKeys = ["PULSE_NTFY_TOPIC"];

export function loadPrivatePulseConfig(configPath: string): PrivatePulseConfig {
  const resolvedPath = resolve(configPath);
  const yamlText = readFileSync(resolvedPath, "utf8");

  return {
    path: resolvedPath,
    pulses: loadPulseDefinitionsFromYaml(yamlText),
  };
}

export function createEmptyPulseState(): PulseState {
  return {
    version: 1,
    occurrences: [],
    events: [],
  };
}

export function createJsonPulseStateStore(statePath: string): PulseStateStore {
  const resolvedPath = resolve(statePath);
  const lockPath = `${resolvedPath}.lock`;

  return {
    read() {
      if (!existsSync(resolvedPath)) {
        return createEmptyPulseState();
      }

      return migratePulseState(JSON.parse(readFileSync(resolvedPath, "utf8")));
    },
    write(state) {
      mkdirSync(dirname(resolvedPath), { recursive: true });
      const temporaryPath = `${resolvedPath}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(compactPulseState(state), null, 2)}\n`);
      renameSync(temporaryPath, resolvedPath);
    },
    async withExclusive(operation) {
      await acquireFileLock(lockPath);
      try {
        return await operation();
      } finally {
        unlinkSync(lockPath);
      }
    },
  };
}

export function createMemoryPulseStateStore(initialState: PulseState = createEmptyPulseState()): PulseStateStore {
  let state = compactPulseState(initialState);
  let exclusive = Promise.resolve();

  return {
    read() {
      return parsePulseState(JSON.parse(JSON.stringify(state)));
    },
    write(nextState) {
      state = compactPulseState(nextState);
    },
    withExclusive(operation) {
      const next = exclusive.then(operation, operation);
      exclusive = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}

/**
 * Retain the event evidence the runner actually consumes while collapsing
 * repeated delivery attempts. Notification retries can otherwise append the
 * same provider failure every five minutes forever.
 */
export function compactPulseState(input: PulseState): PulseState {
  const state = parsePulseState(input);
  const retainedIndexes = new Set<number>();
  const latestByKey = new Map<string, { index: number; at: number }>();

  for (const [index, event] of state.events.entries()) {
    if (event.type === "occurrence_snoozed") {
      retainedIndexes.add(index);
      continue;
    }
    const key = compactionKey(event);
    const at = Date.parse(event.at);
    const current = latestByKey.get(key);
    if (current === undefined || at >= current.at) latestByKey.set(key, { index, at });
  }
  for (const { index } of latestByKey.values()) retainedIndexes.add(index);

  return {
    ...state,
    events: state.events.filter((_event, index) => retainedIndexes.has(index)),
  };
}

/**
 * The management UI needs occurrence summaries, not the runner's audit ledger
 * or pending cleanup queue. Recurrence calculations must use the full stored
 * state before this projection is applied.
 */
export function pulseStateForSnapshot(
  input: PulseState,
  completedHistoryLimit: number,
): PulseState {
  if (!Number.isInteger(completedHistoryLimit) || completedHistoryLimit < 0) {
    throw new Error("Pulse snapshot history limit must be a non-negative integer.");
  }
  const state = compactPulseState(input);
  const snoozeCounts = new Map<string, number>();
  for (const event of state.events) {
    if (event.type !== "occurrence_snoozed" || event.occurrenceId === undefined) continue;
    snoozeCounts.set(event.occurrenceId, (snoozeCounts.get(event.occurrenceId) ?? 0) + 1);
  }
  const completedIds = new Set(
    state.occurrences
      .filter((occurrence) => occurrence.state === "done")
      .sort((left, right) => Date.parse(right.completedAt ?? right.dueAt) - Date.parse(left.completedAt ?? left.dueAt))
      .slice(0, completedHistoryLimit)
      .map((occurrence) => occurrence.id),
  );
  const retainedOccurrenceIds = new Set(
    state.occurrences
      .filter((occurrence) => occurrence.state !== "done" || completedIds.has(occurrence.id))
      .map((occurrence) => occurrence.id),
  );

  return {
    version: state.version,
    occurrences: state.occurrences
      .filter((occurrence) => retainedOccurrenceIds.has(occurrence.id))
      .map((occurrence) => {
        const snoozeCount = Math.max(occurrence.snoozeCount ?? 0, snoozeCounts.get(occurrence.id) ?? 0);
        return snoozeCount > 0 ? { ...occurrence, snoozeCount } : occurrence;
      }),
    events: [],
  };
}

function compactionKey(event: PulseEvent): string {
  const occurrence = event.occurrenceId ?? `pulse:${event.pulseId}`;
  if (event.type === "notification_sent") {
    const channel = typeof event.metadata?.channel === "string" ? event.metadata.channel : "unknown";
    const result = event.metadata?.ok === false ? "failure" : "success";
    const sequenced = result === "success" && isPulseNtfySequenceId(event.metadata?.sequenceId) ? ":sequenced" : "";
    return `${occurrence}:${event.type}:${channel}:${result}${sequenced}`;
  }
  if (event.type === "notification_sequence_cleanup") {
    const sequenceId = isPulseNtfySequenceId(event.metadata?.sequenceId) ? event.metadata.sequenceId : "unknown";
    const result = event.metadata?.ok === true ? "success" : "failure";
    return `${occurrence}:${event.type}:${sequenceId}:${result}`;
  }
  return `${occurrence}:${event.type}`;
}

async function acquireFileLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  const staleAfterMs = 120_000;
  mkdirSync(dirname(lockPath), { recursive: true });
  while (true) {
    try {
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(descriptor, `${process.pid}\n`);
      closeSync(descriptor);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST" && isStaleLock(lockPath, staleAfterMs)) {
        unlinkSync(lockPath);
        continue;
      }
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) {
        throw new Error(`Pulse state is busy; could not acquire ${lockPath} within 10 seconds.`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  }
}

function isStaleLock(lockPath: string, staleAfterMs: number): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

export function migratePulseState(input: unknown): PulseState {
  if (!isRecord(input)) {
    throw new Error("Pulse state must be an object.");
  }

  if (input.version === undefined) {
    return parsePulseState({
      ...input,
      version: 1,
    });
  }

  return parsePulseState(input);
}

export function exportPulseState(stateStore: PulseStateStore): string {
  return `${JSON.stringify(stateStore.read(), null, 2)}\n`;
}

export function importPulseState(stateStore: PulseStateStore, jsonText: string): PulseState {
  const state = migratePulseState(JSON.parse(jsonText));
  stateStore.write(state);
  return state;
}

export function createPulseBackup(input: PulseBackupInput): PulseBackupResult {
  const resolvedStatePath = resolve(input.statePath);
  const resolvedBackupDir = resolve(input.backupDir);
  const state = migratePulseState(JSON.parse(readFileSync(resolvedStatePath, "utf8")));
  const backupPath = join(resolvedBackupDir, `state.${backupTimestamp(input.now ?? new Date())}.json`);

  mkdirSync(resolvedBackupDir, { recursive: true });
  writeFileSync(backupPath, `${JSON.stringify(state, null, 2)}\n`);

  return {
    path: backupPath,
    state,
  };
}

export function restorePulseBackup(input: PulseRestoreInput): PulseState {
  const resolvedBackupPath = resolve(input.backupPath);
  const resolvedStatePath = resolve(input.statePath);
  const state = migratePulseState(JSON.parse(readFileSync(resolvedBackupPath, "utf8")));

  mkdirSync(dirname(resolvedStatePath), { recursive: true });
  writeFileSync(resolvedStatePath, `${JSON.stringify(state, null, 2)}\n`);

  return state;
}

export function copyPrivateFileBackup(filePath: string, backupDir: string, now: Date = new Date()): string {
  const resolvedFilePath = resolve(filePath);
  const resolvedBackupDir = resolve(backupDir);
  const backupPath = join(resolvedBackupDir, `${basename(resolvedFilePath)}.${backupTimestamp(now)}`);

  mkdirSync(resolvedBackupDir, { recursive: true });
  copyFileSync(resolvedFilePath, backupPath);

  return backupPath;
}

export function getPulseEnvConfig(env: Record<string, string | undefined>): PulseEnvConfig {
  const config: PulseEnvConfig = {
    secrets: pickEnv(env, secretEnvKeys),
    recipients: pickEnv(env, recipientEnvKeys),
  };

  if (env.PULSE_CONFIG_PATH !== undefined && env.PULSE_CONFIG_PATH !== "") {
    config.configPath = env.PULSE_CONFIG_PATH;
  }
  if (env.PULSE_STATE_PATH !== undefined && env.PULSE_STATE_PATH !== "") {
    config.statePath = env.PULSE_STATE_PATH;
  }
  if (env.PULSE_RUNNER_TIMEZONE !== undefined && env.PULSE_RUNNER_TIMEZONE !== "") {
    config.timezone = env.PULSE_RUNNER_TIMEZONE;
  }

  return config;
}

/**
 * Validates the private environment contract for a production Pulse runner.
 * This is intentionally separate from the local console-demo configuration.
 */
export function validatePrivateDeliveryEnv(env: Record<string, string | undefined>): void {
  const configPath = requiredPrivateEnv(env, "PULSE_CONFIG_PATH");
  const statePath = requiredPrivateEnv(env, "PULSE_STATE_PATH");
  const privateRoot = requiredPrivateEnv(env, "PULSE_PRIVATE_ROOT");
  for (const [key, path] of [
    ["PULSE_CONFIG_PATH", configPath],
    ["PULSE_STATE_PATH", statePath],
    ["PULSE_PRIVATE_ROOT", privateRoot],
  ] as const) {
    if (!isAbsolute(path)) {
      throw new Error(`${key} must be an absolute path for a private production runner.`);
    }
  }
  for (const [key, path] of [
    ["PULSE_CONFIG_PATH", configPath],
    ["PULSE_STATE_PATH", statePath],
  ] as const) {
    if (!isPathWithin(path, privateRoot)) {
      throw new Error(`${key} must be inside PULSE_PRIVATE_ROOT for a private production runner.`);
    }
  }

  if (env.PULSE_NOTIFY_PROVIDER !== "ntfy") {
    throw new Error("PULSE_NOTIFY_PROVIDER must be ntfy for a private production runner.");
  }

  const server = requiredPrivateEnv(env, "PULSE_NTFY_SERVER");
  let serverUrl: URL;
  try {
    serverUrl = new URL(server);
  } catch {
    throw new Error("PULSE_NTFY_SERVER must be a valid https URL for a private production runner.");
  }
  if (serverUrl.protocol !== "https:") {
    throw new Error("PULSE_NTFY_SERVER must use https for a private production runner.");
  }

  const topic = requiredPrivateEnv(env, "PULSE_NTFY_TOPIC");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(topic)) {
    throw new Error("PULSE_NTFY_TOPIC must be at least 32 URL-safe characters.");
  }

  const ntfyToken = requiredPrivateEnv(env, "PULSE_NTFY_TOKEN");

  const apiToken = requiredPrivateEnv(env, "PULSE_API_TOKEN");
  if (apiToken.length < 32) {
    throw new Error("PULSE_API_TOKEN must be at least 32 characters.");
  }
  if (apiToken === ntfyToken) {
    throw new Error("PULSE_API_TOKEN must be distinct from PULSE_NTFY_TOKEN.");
  }
}

function requiredPrivateEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required for a private production runner.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${key} must not include leading or trailing whitespace.`);
  }
  return value;
}

function isPathWithin(path: string, root: string): boolean {
  const relativePath = relative(resolve(root), resolve(path));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function parsePulseState(input: unknown): PulseState {
  if (!isRecord(input)) {
    throw new Error("Pulse state must be an object.");
  }
  if (input.version !== 1 && input.version !== 2) {
    throw new Error("Pulse state version must be 1 or 2.");
  }
  if (!Array.isArray(input.occurrences)) {
    throw new Error("Pulse state occurrences must be an array.");
  }
  if (!Array.isArray(input.events)) {
    throw new Error("Pulse state events must be an array.");
  }

  const state: PulseState = {
    version: input.version,
    occurrences: input.occurrences.map(parseOccurrenceState),
    events: input.events.map(parseEventState),
  };
  if (input.pendingNotificationSequenceCleanups !== undefined) {
    if (!Array.isArray(input.pendingNotificationSequenceCleanups)) throw new Error("Pulse pending notification cleanups must be an array.");
    state.pendingNotificationSequenceCleanups = input.pendingNotificationSequenceCleanups.map(parsePendingCleanup);
  }
  return state;
}

function parsePendingCleanup(input: unknown): PulsePendingNotificationCleanup {
  if (!isRecord(input)) throw new Error("Pending notification cleanup must be an object.");
  if (!isPulseNtfySequenceId(input.sequenceId)) throw new Error("Pending notification cleanup sequenceId is invalid.");
  return {
    pulseId: requiredString(input, "cleanup.pulseId"),
    occurrenceId: requiredString(input, "cleanup.occurrenceId"),
    sequenceId: input.sequenceId,
    requestedAt: requiredIsoDate(input, "cleanup.requestedAt"),
    titleSnapshot: requiredString(input, "cleanup.titleSnapshot"),
  };
}

function parseOccurrenceState(input: unknown): PulseOccurrence {
  if (!isRecord(input)) {
    throw new Error("Pulse occurrence state must be an object.");
  }

  const occurrence: PulseOccurrence = {
    id: requiredString(input, "occurrence.id"),
    pulseId: requiredString(input, "occurrence.pulseId"),
    dueAt: requiredIsoDate(input, "occurrence.dueAt"),
    state: requiredOccurrenceState(input.state),
  };
  const hasCompletionHistory = input.completedAt !== undefined || input.completionNote !== undefined;

  if (occurrence.state === "done" && input.completedAt === undefined) {
    throw new Error("Done occurrences must include completedAt.");
  }
  if (occurrence.state !== "done" && hasCompletionHistory) {
    throw new Error("Only done occurrences can include completion history.");
  }

  if (input.completedAt !== undefined) {
    occurrence.completedAt = requiredIsoDate(input, "occurrence.completedAt");
  }
  if (input.completionNote !== undefined) {
    occurrence.completionNote = requiredString(input, "occurrence.completionNote");
  }
  if (input.snoozedAt !== undefined) {
    if (occurrence.state !== "scheduled") {
      throw new Error("Only scheduled occurrences can include snooze history.");
    }
    occurrence.snoozedAt = requiredIsoDate(input, "occurrence.snoozedAt");
  }
  if (input.snoozeCount !== undefined) {
    if (typeof input.snoozeCount !== "number" || !Number.isInteger(input.snoozeCount) || input.snoozeCount < 1) {
      throw new Error("occurrence.snoozeCount must be a positive integer.");
    }
    occurrence.snoozeCount = input.snoozeCount;
  }
  if (input.seriesRevision !== undefined) {
    occurrence.seriesRevision = requiredPositiveInteger(input.seriesRevision, "occurrence.seriesRevision");
  }
  if (input.ordinal !== undefined) {
    occurrence.ordinal = requiredPositiveInteger(input.ordinal, "occurrence.ordinal");
  }
  if (input.final !== undefined) {
    if (typeof input.final !== "boolean") throw new Error("occurrence.final must be a boolean.");
    occurrence.final = input.final;
  }
  if (input.titleSnapshot !== undefined) {
    occurrence.titleSnapshot = requiredString(input, "occurrence.titleSnapshot");
  }

  return occurrence;
}

function parseEventState(input: unknown): PulseEvent {
  if (!isRecord(input)) {
    throw new Error("Pulse event state must be an object.");
  }

  const event: PulseEvent = {
    id: requiredString(input, "event.id"),
    pulseId: requiredString(input, "event.pulseId"),
    type: requiredEventType(input.type),
    at: requiredIsoDate(input, "event.at"),
  };

  if (input.occurrenceId !== undefined) {
    event.occurrenceId = requiredString(input, "event.occurrenceId");
  }
  if (input.metadata !== undefined) {
    if (!isRecord(input.metadata)) {
      throw new Error("event.metadata must be an object.");
    }
    event.metadata = input.metadata;
  }

  return event;
}

function pickEnv(env: Record<string, string | undefined>, keys: string[]): Record<string, string> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = env[key];
      return value === undefined || value === "" ? [] : [[key, value]];
    }),
  );
}

function requiredOccurrenceState(input: unknown): PulseOccurrence["state"] {
  if (input === "scheduled" || input === "due" || input === "done") {
    return input;
  }

  throw new Error("Pulse occurrence state must be scheduled, due, or done.");
}

function requiredEventType(input: unknown): PulseEvent["type"] {
  if (
    input === "pulse_created" ||
    input === "occurrence_scheduled" ||
    input === "occurrence_became_due" ||
    input === "notification_sent" ||
    input === "notification_sequence_cleanup" ||
    input === "occurrence_snoozed" ||
    input === "occurrence_completed"
  ) {
    return input;
  }

  throw new Error("Pulse event type is unsupported.");
}

function requiredIsoDate(input: Record<string, unknown>, key: string): string {
  const value = requiredString(input, key);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${key} must be an ISO date string.`);
  }

  return new Date(timestamp).toISOString();
}

function requiredPositiveInteger(input: unknown, key: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return input;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key.split(".").at(-1) ?? key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string.`);
  }

  return value;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function backupTimestamp(date: Date): string {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".000", "");
}
