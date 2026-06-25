import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  applyOccurrenceAction,
  createEmptyPulseState,
  createJsonPulseStateStore,
  createMemoryPulseStateStore,
  createNotificationDispatcherFromEnv,
  createPulseBackup,
  createPulseEvent,
  exportPulseState,
  importPulseState,
  loadPrivatePulseConfig,
  migratePulseState,
  restorePulseBackup,
  runPulseRunnerTick,
  validatePulseReleaseReadiness,
} from "../dist/index.js";

const root = new URL("../", import.meta.url).pathname;

const weeklyPulse = {
  id: "weekly-demo-check",
  title: "Weekly demo check",
  active: true,
  schedule: {
    type: "weekly",
    daysOfWeek: ["sunday"],
    time: "09:00",
    timezone: "America/Los_Angeles",
  },
  notificationPolicy: {
    channels: ["console"],
    repeatEveryMinutes: 30,
  },
};

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "pulse-phase9-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("backup restores state and history", () => {
  withTempDir((dir) => {
    const store = createJsonPulseStateStore(join(dir, "state.json"));
    const state = createEmptyPulseState();
    state.occurrences.push({
      id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
      pulseId: "weekly-demo-check",
      dueAt: "2026-06-28T16:00:00.000Z",
      state: "done",
      completedAt: "2026-06-28T16:07:00.000Z",
      completionNote: "Completed in private runner.",
    });
    state.events.push(
      createPulseEvent({
        pulseId: "weekly-demo-check",
        occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
        type: "occurrence_completed",
        at: new Date("2026-06-28T16:07:00.000Z"),
      }),
    );
    store.write(state);

    const backup = createPulseBackup({
      statePath: join(dir, "state.json"),
      backupDir: join(dir, "backups"),
      now: new Date("2026-06-29T12:00:00.000Z"),
    });

    store.write(createEmptyPulseState());
    restorePulseBackup({
      backupPath: backup.path,
      statePath: join(dir, "state.json"),
    });

    const restored = store.read();
    assert.equal(restored.occurrences[0].state, "done");
    assert.equal(restored.occurrences[0].completedAt, "2026-06-28T16:07:00.000Z");
    assert.equal(restored.events[0].type, "occurrence_completed");
  });
});

test("migrations preserve existing occurrences", () => {
  const legacyState = {
    occurrences: [
      {
        id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
        pulseId: "weekly-demo-check",
        dueAt: "2026-06-28T16:00:00.000Z",
        state: "due",
      },
    ],
    events: [
      {
        id: "evt:legacy",
        pulseId: "weekly-demo-check",
        occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
        type: "notification_sent",
        at: "2026-06-28T16:00:00.000Z",
        metadata: { channel: "console", ok: true },
      },
    ],
  };

  const migrated = migratePulseState(legacyState);

  assert.equal(migrated.version, 1);
  assert.deepEqual(migrated.occurrences, legacyState.occurrences);
  assert.deepEqual(migrated.events, legacyState.events);
});

test("state export migrates pre-version state through the documented CLI path", () => {
  withTempDir((dir) => {
    const statePath = join(dir, "legacy-state.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        occurrences: [
          {
            id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
            pulseId: "weekly-demo-check",
            dueAt: "2026-06-28T16:00:00.000Z",
            state: "due",
          },
        ],
        events: [],
      }),
    );

    const result = runPulseStateCli(["export"], {
      PULSE_STATE_PATH: statePath,
    });

    assert.equal(result.status, 0, result.stderr);
    const exported = JSON.parse(result.stdout);
    assert.equal(exported.version, 1);
    assert.equal(exported.occurrences[0].state, "due");
  });
});

test("state export and import validate private state before writing", () => {
  withTempDir((dir) => {
    const source = createJsonPulseStateStore(join(dir, "source.json"));
    const target = createJsonPulseStateStore(join(dir, "target.json"));
    const state = createEmptyPulseState();
    state.occurrences.push({
      id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
      pulseId: "weekly-demo-check",
      dueAt: "2026-06-28T16:00:00.000Z",
      state: "scheduled",
    });
    source.write(state);

    const exported = exportPulseState(source);
    importPulseState(target, exported);
    assert.deepEqual(target.read(), source.read());

    assert.throws(
      () => importPulseState(target, JSON.stringify({ version: 1, occurrences: "bad", events: [] })),
      /Pulse state occurrences must be an array/,
    );
  });
});

test("pulse-state CLI imports, backs up, and restores validated state", () => {
  withTempDir((dir) => {
    const statePath = join(dir, "state.json");
    const importPath = join(dir, "import.json");
    const backupDir = join(dir, "backups");
    writeFileSync(
      importPath,
      JSON.stringify({
        version: 1,
        occurrences: [
          {
            id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
            pulseId: "weekly-demo-check",
            dueAt: "2026-06-28T16:00:00.000Z",
            state: "done",
            completedAt: "2026-06-28T16:07:00.000Z",
          },
        ],
        events: [],
      }),
    );

    const imported = runPulseStateCli(["import", "--input", importPath], {
      PULSE_STATE_PATH: statePath,
    });
    assert.equal(imported.status, 0, imported.stderr);

    const backup = runPulseStateCli(["backup", "--backup-dir", backupDir], {
      PULSE_STATE_PATH: statePath,
    });
    assert.equal(backup.status, 0, backup.stderr);
    const backupPath = JSON.parse(backup.stdout).backupPath;

    writeFileSync(statePath, JSON.stringify(createEmptyPulseState()));
    const restored = runPulseStateCli(["restore", "--backup", backupPath], {
      PULSE_STATE_PATH: statePath,
    });

    assert.equal(restored.status, 0, restored.stderr);
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.occurrences[0].state, "done");
    assert.equal(state.occurrences[0].completedAt, "2026-06-28T16:07:00.000Z");
  });
});

test("bad config fails loudly", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "bad-pulses.yaml");
    writeFileSync(
      configPath,
      [
        "pulses:",
        "  - id: bad-weekly",
        "    title: Bad weekly",
        "    active: true",
        "    schedule:",
        "      type: weekly",
        "      daysOfWeek: []",
        "      time: \"09:00\"",
        "      timezone: America/Los_Angeles",
      ].join("\n"),
    );

    assert.throws(() => loadPrivatePulseConfig(configPath), /Weekly pulse schedule must include daysOfWeek/);
  });
});

test("missing credentials fail with setup guidance", () => {
  assert.throws(
    () =>
      createNotificationDispatcherFromEnv({
        PULSE_NOTIFICATION_CHANNEL: "sms",
        PULSE_TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
      }),
    /Set PULSE_TWILIO_AUTH_TOKEN before using PULSE_NOTIFICATION_CHANNEL=sms. See docs\/env-vars.md/,
  );
});

test("release fixture proves due -> notify -> done -> stop", async () => {
  const store = createMemoryPulseStateStore(createEmptyPulseState());
  const sends = [];
  const notifier = {
    send(input) {
      sends.push(input);
      return { ok: true };
    },
  };

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:00:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  const dueState = store.read();
  const dueOccurrence = dueState.occurrences[0];
  assert.equal(dueOccurrence.state, "due");
  assert.equal(sends.length, 1);

  const doneState = store.read();
  const completed = applyOccurrenceAction(dueOccurrence, {
    type: "done",
    at: new Date("2026-06-28T16:05:00.000Z"),
  });
  doneState.occurrences = doneState.occurrences.map((occurrence) =>
    occurrence.id === completed.id ? completed : occurrence,
  );
  doneState.events.push(
    createPulseEvent({
      pulseId: completed.pulseId,
      occurrenceId: completed.id,
      type: "occurrence_completed",
      at: new Date(completed.completedAt),
    }),
  );
  store.write(doneState);

  await runPulseRunnerTick({
    now: new Date("2026-06-28T16:30:00.000Z"),
    pulses: [weeklyPulse],
    stateStore: store,
    notifier,
  });

  assert.equal(sends.length, 1);
  assert.equal(store.read().occurrences[0].state, "done");
});

test("release readiness checklist covers backup, migration, security, privacy, and acceptance gates", () => {
  const result = validatePulseReleaseReadiness(root);
  const releaseChecklist = readFileSync(join(root, "docs", "release-checklist.md"), "utf8");

  assert.deepEqual(result.missing, []);
  assert.match(releaseChecklist, /npm test/);
  assert.match(releaseChecklist, /backup/i);
  assert.match(releaseChecklist, /migration/i);
  assert.match(releaseChecklist, /security/i);
  assert.match(releaseChecklist, /privacy scanner/i);
  assert.match(releaseChecklist, /due -> notify -> done -> stop/);
});

function runPulseStateCli(args, env = {}) {
  return spawnSync(process.execPath, [join(root, "bin", "pulse-state.mjs"), ...args], {
    cwd: root,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}
