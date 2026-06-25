import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

export type PulseEnvConfig = {
  configPath?: string;
  statePath?: string;
  timezone?: string;
  secrets: Record<string, string>;
  recipients: Record<string, string>;
};

const secretEnvKeys = ["PULSE_EMAIL_SMTP_PASSWORD"];
const recipientEnvKeys = ["PULSE_EMAIL_TO"];

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

      return parsePulseState(JSON.parse(readFileSync(resolvedPath, "utf8")));
    },
    write(state) {
      mkdirSync(dirname(resolvedPath), { recursive: true });
      writeFileSync(resolvedPath, `${JSON.stringify(parsePulseState(state), null, 2)}\n`);
    },
  };
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

function parsePulseState(input: unknown): PulseState {
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
