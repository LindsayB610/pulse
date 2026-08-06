import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createEmptyPulseState,
  createJsonPulseStateStore,
  getPulseEnvConfig,
  loadPrivatePulseConfig,
  validatePrivateDeliveryEnv,
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

test("private JSON state store serializes concurrent mutations from runner and API", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-state-lock-"));
  const statePath = join(dir, "state.json");
  const stateStore = createJsonPulseStateStore(statePath);
  try {
    await Promise.all([
      stateStore.withExclusive(async () => {
        const state = stateStore.read();
        await new Promise((resolve) => setTimeout(resolve, 10));
        state.events.push({ id: "runner", pulseId: "pulse", occurrenceId: "occurrence", type: "notification_sent", at: "2026-01-01T00:00:00.000Z" });
        stateStore.write(state);
      }),
      stateStore.withExclusive(() => {
        const state = stateStore.read();
        state.events.push({ id: "api", pulseId: "pulse", occurrenceId: "occurrence", type: "occurrence_completed", at: "2026-01-01T00:01:00.000Z" });
        stateStore.write(state);
      }),
    ]);
    assert.deepEqual(stateStore.read().events.map((event) => event.id).sort(), ["api", "runner"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("private JSON state store reclaims a stale crash lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-stale-lock-"));
  const statePath = join(dir, "state.json");
  const stateStore = createJsonPulseStateStore(statePath);
  try {
    writeFileSync(`${statePath}.lock`, "crashed-process\n");
    const stale = new Date(Date.now() - 180_000);
    utimesSync(`${statePath}.lock`, stale, stale);
    await stateStore.withExclusive(() => stateStore.write(createEmptyPulseState()));
    assert.deepEqual(stateStore.read(), createEmptyPulseState());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("secrets are read from env and not from committed example files", () => {
  const env = {
    PULSE_CONFIG_PATH: "/private/pulse/pulses.yaml",
    PULSE_STATE_PATH: "/private/pulse/state.json",
    PULSE_NTFY_TOKEN: "runner-secret",
    PULSE_NTFY_TOPIC: "private-pulse-topic",
    PULSE_API_TOKEN: "runner-api-secret",
  };
  const config = getPulseEnvConfig(env);
  const exampleEnv = readFileSync(join(root, ".env.example"), "utf8");
  const examplePulses = readFileSync(join(root, "pulses.example.yaml"), "utf8");

  assert.equal(config.secrets.PULSE_NTFY_TOKEN, "runner-secret");
  assert.equal(config.secrets.PULSE_API_TOKEN, "runner-api-secret");
  assert.equal(config.recipients.PULSE_NTFY_TOPIC, "private-pulse-topic");
  assert.doesNotMatch(exampleEnv, /runner-secret|private-pulse-topic/);
  assert.doesNotMatch(examplePulses, /runner-secret|private-pulse-topic/);
});

test("private production delivery config requires authenticated ntfy and a separate runner API token", () => {
  const env = {
    PULSE_CONFIG_PATH: "/Users/lindsaybrunner/Documents/workshop-private/pulse/pulses.yaml",
    PULSE_STATE_PATH: "/Users/lindsaybrunner/Documents/workshop-private/pulse/state.json",
    PULSE_PRIVATE_ROOT: "/Users/lindsaybrunner/Documents/workshop-private/pulse",
    PULSE_NOTIFY_PROVIDER: "ntfy",
    PULSE_NTFY_SERVER: "https://ntfy.sh",
    PULSE_NTFY_TOPIC: "A4Ns8xqk2Vw7mZ3rT9yP5dJ6hL1cB0eF",
    PULSE_NTFY_TOKEN: "server-access-token",
    PULSE_API_TOKEN: "runner-api-token-with-at-least-thirty-two-characters",
  };

  assert.doesNotThrow(() => validatePrivateDeliveryEnv(env));
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_NTFY_TOKEN: "" }),
    /PULSE_NTFY_TOKEN is required/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_NTFY_TOPIC: "easy-to-guess" }),
    /PULSE_NTFY_TOPIC must be at least 32 URL-safe characters/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_API_TOKEN: "too-short" }),
    /PULSE_API_TOKEN must be at least 32 characters/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_NTFY_SERVER: "http://ntfy.example.test" }),
    /PULSE_NTFY_SERVER must use https/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_NTFY_SERVER: "https://" }),
    /PULSE_NTFY_SERVER must be a valid https URL/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_CONFIG_PATH: "private/pulses.yaml" }),
    /PULSE_CONFIG_PATH must be an absolute path/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_CONFIG_PATH: "/tmp/public-pulses.yaml" }),
    /PULSE_CONFIG_PATH must be inside PULSE_PRIVATE_ROOT/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_NTFY_TOKEN: env.PULSE_API_TOKEN }),
    /PULSE_API_TOKEN must be distinct/,
  );
  assert.throws(
    () => validatePrivateDeliveryEnv({ ...env, PULSE_NTFY_TOPIC: ` ${env.PULSE_NTFY_TOPIC}` }),
    /PULSE_NTFY_TOPIC must not include leading or trailing whitespace/,
  );
});

test("runner mode must be explicit so production validation cannot be bypassed", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-r1-runner-mode-"));
  try {
    const result = spawnSync(process.execPath, ["bin/pulse-runner.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        PULSE_RUNNER_MODE: "",
        PULSE_CONFIG_PATH: join(root, "pulses.example.yaml"),
        PULSE_STATE_PATH: join(dir, "state.json"),
        PULSE_PRIVATE_ROOT: dir,
        PULSE_NOTIFY_PROVIDER: "console",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Set PULSE_RUNNER_MODE to demo or production/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production runner rejects an invalid private delivery environment before running", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-r1-runner-"));
  try {
    const configPath = join(dir, "pulses.yaml");
    copyFileSync(join(root, "pulses.example.yaml"), configPath);
    const result = spawnSync(process.execPath, ["bin/pulse-runner.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        PULSE_RUNNER_MODE: "production",
        PULSE_CONFIG_PATH: configPath,
        PULSE_STATE_PATH: join(dir, "state.json"),
        PULSE_PRIVATE_ROOT: dir,
        PULSE_NOTIFY_PROVIDER: "console",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /PULSE_NOTIFY_PROVIDER must be ntfy/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production runner accepts the complete private delivery contract", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-r1-production-runner-"));
  try {
    const configPath = join(dir, "pulses.yaml");
    copyFileSync(join(root, "pulses.example.yaml"), configPath);
    const result = spawnSync(process.execPath, ["bin/pulse-runner.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        PULSE_RUNNER_MODE: "production",
        PULSE_CONFIG_PATH: configPath,
        PULSE_STATE_PATH: join(dir, "state.json"),
        PULSE_PRIVATE_ROOT: dir,
        PULSE_NOTIFY_PROVIDER: "ntfy",
        PULSE_NTFY_SERVER: "https://ntfy.sh",
        PULSE_NTFY_TOPIC: "A4Ns8xqk2Vw7mZ3rT9yP5dJ6hL1cB0eF",
        PULSE_NTFY_TOKEN: "server-access-token",
        PULSE_API_TOKEN: "runner-api-token-with-at-least-thirty-two-characters",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"scheduled":1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
