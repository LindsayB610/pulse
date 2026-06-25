import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { loadPulseDefinitionsFromYaml } from "../dist/index.js";

const root = new URL("../", import.meta.url);
const rootPath = root.pathname;

function read(relativePath) {
  return readFileSync(join(rootPath, relativePath), "utf8");
}

test("phase 6 sample pulse configs remain parseable", () => {
  ["pulses.example.yaml", "examples/forced-test-pulse.yaml"].forEach((relativePath) => {
    const pulses = loadPulseDefinitionsFromYaml(read(relativePath));

    assert.ok(pulses.length > 0, `${relativePath} should include at least one pulse`);
    assert.ok(pulses[0].notificationPolicy?.channels.length > 0, `${relativePath} should include a channel`);
  });
});

test("local demo runner command smokes with public sample config", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-phase6-"));
  const statePath = join(dir, "state.json");

  try {
    const result = spawnSync(process.execPath, ["bin/pulse-runner.mjs"], {
      cwd: rootPath,
      env: {
        ...process.env,
        PULSE_CONFIG_PATH: join(rootPath, "pulses.example.yaml"),
        PULSE_STATE_PATH: statePath,
        PULSE_NOTIFICATION_CHANNEL: "console",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"scheduled":1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("done command completes the only due private occurrence", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-phase6-done-"));
  const statePath = join(dir, "state.json");
  writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        version: 1,
        occurrences: [
          {
            id: "forced-test-check:2026-06-28T16:00:00.000Z",
            pulseId: "forced-test-check",
            dueAt: "2026-06-28T16:00:00.000Z",
            state: "due",
          },
        ],
        events: [],
      },
      null,
      2,
    )}\n`,
  );

  try {
    const result = spawnSync(process.execPath, ["bin/pulse-done.mjs", "--note", "Verified runner."], {
      cwd: rootPath,
      env: {
        ...process.env,
        PULSE_STATE_PATH: statePath,
      },
      encoding: "utf8",
    });
    const state = JSON.parse(readFileSync(statePath, "utf8"));

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"state":"done"/);
    assert.equal(state.occurrences[0].state, "done");
    assert.equal(state.occurrences[0].completionNote, "Verified runner.");
    assert.equal(state.events[0].type, "occurrence_completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deployment guide has an explicit success checklist", () => {
  const guide = read("docs/deploy-runner.md");

  assert.match(guide, /## Success Checklist/);
  assert.match(guide, /private\/pulses\.yaml/);
  assert.match(guide, /docker compose -f deploy\/docker-compose\.yml up -d --build/);
  assert.match(guide, /Confirm a Twilio SMS arrives/);
  assert.match(guide, /Confirm notifications stop after Done/);
});

test("docker compose template keeps private runner data outside git", () => {
  const compose = read("deploy/docker-compose.yml");

  assert.match(compose, /\.\.\/private:\/pulse\/private/);
  assert.match(compose, /PULSE_CONFIG_PATH: \/pulse\/private\/pulses\.yaml/);
  assert.match(compose, /PULSE_STATE_PATH: \/pulse\/private\/state\.json/);
  assert.doesNotMatch(compose, /PULSE_TWILIO_AUTH_TOKEN: .+/);
});
