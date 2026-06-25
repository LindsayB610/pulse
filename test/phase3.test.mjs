import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createEmptyPulseState,
  createJsonPulseStateStore,
  getPulseEnvConfig,
  loadPrivatePulseConfig,
} from "../dist/index.js";

const root = new URL("../", import.meta.url).pathname;

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "pulse-phase3-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("public example config still parses through the private config loader", () => {
  const config = loadPrivatePulseConfig(join(root, "pulses.example.yaml"));
  assert.equal(config.pulses.length, 1);
  assert.equal(config.pulses[0].id, "weekly-demo-check");
});

test("real config path can be supplied outside the repo", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "pulses.yaml");
    writeFileSync(
      configPath,
      [
        "pulses:",
        "  - id: private-demo",
        "    title: Private demo",
        "    active: true",
        "    schedule:",
        "      type: weekly",
        "      daysOfWeek: [sunday]",
        "      time: \"09:00\"",
        "      timezone: America/Los_Angeles",
      ].join("\n"),
    );

    const config = loadPrivatePulseConfig(configPath);
    assert.equal(config.path, configPath);
    assert.equal(config.pulses[0].id, "private-demo");
  });
});

test("secrets are read from env and not from committed example files", () => {
  const env = {
    PULSE_CONFIG_PATH: "/private/pulse/pulses.yaml",
    PULSE_STATE_PATH: "/private/pulse/state.json",
    PULSE_EMAIL_SMTP_PASSWORD: "runner-secret",
    PULSE_EMAIL_TO: "private@example.test",
  };
  const config = getPulseEnvConfig(env);
  const exampleEnv = readFileSync(join(root, ".env.example"), "utf8");
  const examplePulses = readFileSync(join(root, "pulses.example.yaml"), "utf8");

  assert.equal(config.secrets.PULSE_EMAIL_SMTP_PASSWORD, "runner-secret");
  assert.equal(config.recipients.PULSE_EMAIL_TO, "private@example.test");
  assert.doesNotMatch(exampleEnv, /runner-secret|private@example\.test/);
  assert.doesNotMatch(examplePulses, /runner-secret|private@example\.test/);
});

test("state write/read round trips occurrences and events", () => {
  withTempDir((dir) => {
    const store = createJsonPulseStateStore(join(dir, "state.json"));
    const state = createEmptyPulseState();
    state.occurrences.push({
      id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
      pulseId: "weekly-demo-check",
      dueAt: "2026-06-28T16:00:00.000Z",
      state: "scheduled",
    });
    state.events.push({
      id: "evt:weekly-demo-check:2026-06-28T16:00:00.000Z:occurrence_scheduled:2026-06-25T12:00:00.000Z",
      pulseId: "weekly-demo-check",
      occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
      type: "occurrence_scheduled",
      at: "2026-06-25T12:00:00.000Z",
    });

    store.write(state);
    assert.deepEqual(store.read(), state);
  });
});

test("completion history persists in local state", () => {
  withTempDir((dir) => {
    const store = createJsonPulseStateStore(join(dir, "nested", "state.json"));
    const state = createEmptyPulseState();
    state.occurrences.push({
      id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
      pulseId: "weekly-demo-check",
      dueAt: "2026-06-28T16:00:00.000Z",
      state: "done",
      completedAt: "2026-06-28T16:07:00.000Z",
      completionNote: "Done from private runner.",
    });

    store.write(state);
    const restored = store.read();
    assert.equal(restored.occurrences[0].completedAt, "2026-06-28T16:07:00.000Z");
    assert.equal(restored.occurrences[0].completionNote, "Done from private runner.");
  });
});

test("persisted done occurrences must include completedAt", () => {
  withTempDir((dir) => {
    const store = createJsonPulseStateStore(join(dir, "state.json"));
    writeFileSync(
      join(dir, "state.json"),
      JSON.stringify({
        version: 1,
        occurrences: [
          {
            id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
            pulseId: "weekly-demo-check",
            dueAt: "2026-06-28T16:00:00.000Z",
            state: "done",
          },
        ],
        events: [],
      }),
    );

    assert.throws(() => store.read(), /Done occurrences must include completedAt/);
  });
});

test("persisted non-done occurrences cannot carry completion history", () => {
  for (const state of ["scheduled", "due"]) {
    withTempDir((dir) => {
      const store = createJsonPulseStateStore(join(dir, "state.json"));
      writeFileSync(
        join(dir, "state.json"),
        JSON.stringify({
          version: 1,
          occurrences: [
            {
              id: `weekly-demo-check:${state}`,
              pulseId: "weekly-demo-check",
              dueAt: "2026-06-28T16:00:00.000Z",
              state,
              completedAt: "2026-06-28T16:07:00.000Z",
              completionNote: "Should not be here.",
            },
          ],
          events: [],
        }),
      );

      assert.throws(() => store.read(), /Only done occurrences can include completion history/);
    });
  }
});
