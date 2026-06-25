import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { loadPulseDefinitionsFromYaml, type PulseDefinition, type PulseEvent, type PulseOccurrence } from "./model.js";

export type PrivatePulseConfig = {
  path: string;
  pulses: PulseDefinition[];
};

export type PulseState = {
  version: 1;
  occurrences: PulseOccurrence[];
  events: PulseEvent[];
};

export type PulseStateStore = {
  read(): PulseState;
  write(state: PulseState): void;
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

const secretEnvKeys = ["PULSE_TWILIO_AUTH_TOKEN"];
const recipientEnvKeys = ["PULSE_SMS_TO"];

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

  return {
    read() {
      if (!existsSync(resolvedPath)) {
        return createEmptyPulseState();
      }

      return migratePulseState(JSON.parse(readFileSync(resolvedPath, "utf8")));
    },
    write(state) {
      mkdirSync(dirname(resolvedPath), { recursive: true });
      writeFileSync(resolvedPath, `${JSON.stringify(parsePulseState(state), null, 2)}\n`);
    },
  };
}

export function createMemoryPulseStateStore(initialState: PulseState = createEmptyPulseState()): PulseStateStore {
  let state = parsePulseState(initialState);

  return {
    read() {
      return parsePulseState(JSON.parse(JSON.stringify(state)));
    },
    write(nextState) {
      state = parsePulseState(nextState);
    },
  };
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

export function parsePulseState(input: unknown): PulseState {
  if (!isRecord(input)) {
    throw new Error("Pulse state must be an object.");
  }
  if (input.version !== 1) {
    throw new Error("Pulse state version must be 1.");
  }
  if (!Array.isArray(input.occurrences)) {
    throw new Error("Pulse state occurrences must be an array.");
  }
  if (!Array.isArray(input.events)) {
    throw new Error("Pulse state events must be an array.");
  }

  return {
    version: 1,
    occurrences: input.occurrences.map(parseOccurrenceState),
    events: input.events.map(parseEventState),
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
