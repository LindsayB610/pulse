#!/usr/bin/env node
import { applyOccurrenceAction, createJsonPulseStateStore, createPulseEvent, getPulseEnvConfig } from "../dist/index.js";

const env = getPulseEnvConfig(process.env);

if (!env.statePath) {
  console.error("Set PULSE_STATE_PATH before marking a Pulse occurrence Done.");
  process.exit(1);
}

const occurrenceId = readArg("--occurrence-id");
const completionNote = readArg("--note");
const stateStore = createJsonPulseStateStore(env.statePath);
const state = stateStore.read();
const occurrence = selectOccurrence(state.occurrences, occurrenceId);
const completed = applyOccurrenceAction(occurrence, {
  type: "done",
  at: new Date(),
  ...(completionNote === undefined ? {} : { completionNote }),
});

state.occurrences = state.occurrences.map((candidate) => (candidate.id === completed.id ? completed : candidate));
state.events.push(
  createPulseEvent({
    pulseId: completed.pulseId,
    occurrenceId: completed.id,
    type: "occurrence_completed",
    at: new Date(completed.completedAt),
    ...(completionNote === undefined ? {} : { metadata: { note: completionNote } }),
  }),
);
stateStore.write(state);

console.log(
  JSON.stringify({
    occurrenceId: completed.id,
    state: completed.state,
    completedAt: completed.completedAt,
  }),
);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function selectOccurrence(occurrences, occurrenceId) {
  if (occurrenceId !== undefined) {
    const occurrence = occurrences.find((candidate) => candidate.id === occurrenceId);
    if (!occurrence) {
      throw new Error(`No occurrence found for ${occurrenceId}.`);
    }
    return occurrence;
  }

  const dueOccurrences = occurrences.filter((occurrence) => occurrence.state === "due");
  if (dueOccurrences.length !== 1) {
    throw new Error(`Expected exactly one due occurrence, found ${dueOccurrences.length}. Use --occurrence-id.`);
  }

  return dueOccurrences[0];
}
