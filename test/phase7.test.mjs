import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  createMemoryPulseStateStore,
  createPulseUiServer,
} from "../dist/index.js";

const root = new URL("../", import.meta.url);
const rootPath = root.pathname;
const now = new Date("2026-06-28T16:30:00.000Z");
const pulses = [
  {
    id: "weekly-check",
    title: "Weekly check",
    active: true,
    instructions: "Confirm the weekly task is complete.",
    schedule: {
      type: "weekly",
      daysOfWeek: ["sunday"],
      time: "09:00",
      timezone: "America/New_York",
    },
    notificationPolicy: {
      channels: ["ntfy"],
      repeatEveryMinutes: 30,
    },
  },
  {
    id: "upcoming-check",
    title: "Upcoming check",
    active: true,
    schedule: {
      type: "weekly",
      daysOfWeek: ["monday"],
      time: "09:00",
      timezone: "America/New_York",
    },
  },
];

function createUiFixture() {
  return {
    version: 1,
    occurrences: [
      {
        id: "weekly-check:2026-06-28T13:00:00.000Z",
        pulseId: "weekly-check",
        dueAt: "2026-06-28T13:00:00.000Z",
        state: "due",
      },
      {
        id: "upcoming-check:2026-06-29T13:00:00.000Z",
        pulseId: "upcoming-check",
        dueAt: "2026-06-29T13:00:00.000Z",
        state: "scheduled",
      },
      {
        id: "weekly-check:2026-06-21T13:00:00.000Z",
        pulseId: "weekly-check",
        dueAt: "2026-06-21T13:00:00.000Z",
        state: "done",
        completedAt: "2026-06-21T13:05:00.000Z",
        completionNote: "Finished last week.",
      },
    ],
    events: [
      {
        id: "evt:weekly-check:2026-06-28T13:00:00.000Z:notification_sent:2026-06-28T16:00:00.000Z",
        pulseId: "weekly-check",
        occurrenceId: "weekly-check:2026-06-28T13:00:00.000Z",
        type: "notification_sent",
        at: "2026-06-28T16:00:00.000Z",
        metadata: {
          channel: "ntfy",
          ok: true,
          detail: "sent to [redacted]",
        },
      },
    ],
  };
}

test("runner server exposes no standalone HTML management page", async () => {
  const ui = createPulseUiServer({ pulses, stateStore: createMemoryPulseStateStore(createUiFixture()), apiToken: "token" });
  const response = await ui.handle(new Request("http://pulse.local/"));

  assert.equal(response.status, 404);
});

test("phase 7 Done action records completion, moves occurrence to history, and stops active state", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
    apiToken: "workshop-private-token",
  });

  const response = await ui.handle(
    new Request("http://pulse.local/api/v1/occurrences/weekly-check%3A2026-06-28T13%3A00%3A00.000Z/done", {
      method: "POST",
      body: new URLSearchParams({ completionNote: "Done from UI." }),
      headers: {
        authorization: "Bearer workshop-private-token",
        "content-type": "application/x-www-form-urlencoded",
      },
    }),
  );
  const state = stateStore.read();
  const completed = state.occurrences.find(
    (occurrence) => occurrence.id === "weekly-check:2026-06-28T13:00:00.000Z",
  );

  assert.equal(response.status, 200);
  assert.equal(completed?.state, "done");
  assert.equal(completed?.completionNote, "Done from UI.");
  assert.equal(state.events.at(-1)?.type, "occurrence_completed");

});

test("phase 7 Done action overrides an active snooze but not an untouched future occurrence", async () => {
  const fixture = createUiFixture();
  fixture.occurrences[0] = {
    ...fixture.occurrences[0],
    state: "scheduled",
    dueAt: "2026-06-28T17:00:00.000Z",
    snoozedAt: "2026-06-28T16:30:00.000Z",
    snoozeCount: 1,
  };
  const stateStore = createMemoryPulseStateStore(fixture);
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
    apiToken: "workshop-private-token",
  });
  const doneRequest = (id) => new Request(
    `http://pulse.local/api/v1/occurrences/${encodeURIComponent(id)}/done`,
    { method: "POST", headers: { authorization: "Bearer workshop-private-token" } },
  );

  const completedResponse = await ui.handle(doneRequest(fixture.occurrences[0].id));
  assert.equal(completedResponse.status, 200);
  const completed = (await completedResponse.json()).occurrence;
  assert.equal(completed.state, "done");
  assert.equal(completed.snoozedAt, undefined);
  assert.equal(completed.snoozeCount, undefined);

  const futureResponse = await ui.handle(doneRequest(fixture.occurrences[1].id));
  assert.equal(futureResponse.status, 409);
  assert.match(await futureResponse.text(), /not active yet/i);
});

test("phase 7 Done action handles stale completion attempts without a server error", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
    apiToken: "workshop-private-token",
  });
  const request = () =>
    new Request("http://pulse.local/api/v1/occurrences/weekly-check%3A2026-06-28T13%3A00%3A00.000Z/done", {
      method: "POST",
      body: new URLSearchParams({ completionNote: "Double submit." }),
      headers: {
        authorization: "Bearer workshop-private-token",
        "content-type": "application/x-www-form-urlencoded",
      },
    });

  assert.equal((await ui.handle(request())).status, 200);
  const staleResponse = await ui.handle(request());
  const state = stateStore.read();

  assert.equal(staleResponse.status, 409);
  assert.match(await staleResponse.text(), /already done/i);
  assert.equal(state.events.filter((event) => event.type === "occurrence_completed").length, 1);
});

test("private runner API gives Workshop an authorized snapshot and Done action", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
    apiToken: "workshop-private-token",
    allowedOrigins: ["http://127.0.0.1:1420"],
  });

  const unauthorized = await ui.handle(new Request("http://pulse.local/api/v1/snapshot"));
  assert.equal(unauthorized.status, 401);

  const crossOrigin = await ui.handle(
    new Request("http://pulse.local/api/v1/snapshot", {
      headers: { origin: "https://untrusted.example" },
    }),
  );
  assert.equal(crossOrigin.headers.get("access-control-allow-origin"), null);

  const preflight = await ui.handle(
    new Request("http://pulse.local/api/v1/snapshot", {
      method: "OPTIONS",
      headers: { origin: "http://127.0.0.1:1420" },
    }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:1420");

  const snapshot = await ui.handle(
    new Request("http://pulse.local/api/v1/snapshot", {
      headers: { authorization: "Bearer workshop-private-token" },
    }),
  );
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json()).state.occurrences.length, 3);

  const completed = await ui.handle(
    new Request("http://pulse.local/api/v1/occurrences/weekly-check%3A2026-06-28T13%3A00%3A00.000Z/done", {
      method: "POST",
      headers: {
        authorization: "Bearer workshop-private-token",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ completionNote: "Done from Workshop." }),
    }),
  );
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).occurrence.state, "done");
  assert.equal(stateStore.read().occurrences[0].completionNote, "Done from Workshop.");
});

test("phase 7 API listen serves an authorized snapshot over local HTTP", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
    apiToken: "workshop-private-token",
  });
  const running = await ui.listen({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`http://127.0.0.1:${running.port}/api/v1/snapshot`, { headers: { authorization: "Bearer workshop-private-token" } });
    const snapshot = await response.json();

    assert.equal(response.status, 200);
    assert.equal(snapshot.pulses[0].title, "Weekly check");
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  } finally {
    await running.close();
  }
});

test("Pulse API command starts with private config and state paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-phase7-ui-"));
  const configPath = join(dir, "pulses.yaml");
  const statePath = join(dir, "state.json");

  writeFileSync(
    configPath,
    `pulses:
  - id: weekly-check
    title: Weekly check
    active: true
    schedule:
      type: weekly
      daysOfWeek: [sunday]
      time: "09:00"
      timezone: America/New_York
`,
  );
  writeFileSync(statePath, `${JSON.stringify(createUiFixture(), null, 2)}\n`);

  try {
    const result = spawnSync(process.execPath, ["bin/pulse-api.mjs", "--once"], {
      cwd: rootPath,
      env: {
        ...process.env,
        PULSE_CONFIG_PATH: configPath,
        PULSE_STATE_PATH: statePath,
        PULSE_RUNNER_MODE: "demo",
        PULSE_API_TOKEN: "workshop-private-token-with-at-least-32-characters",
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"api":true/);
    assert.match(result.stdout, /"port":8787/);
    assert.match(readFileSync(statePath, "utf8"), /weekly-check/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Pulse API fails closed without an explicit mode and private bearer token", () => {
  const missingMode = spawnSync(process.execPath, ["bin/pulse-api.mjs", "--once"], {
    cwd: rootPath,
    env: { ...process.env, PULSE_CONFIG_PATH: "pulses.example.yaml", PULSE_STATE_PATH: "state.json" },
    encoding: "utf8",
  });
  assert.notEqual(missingMode.status, 0);
  assert.match(missingMode.stderr, /PULSE_RUNNER_MODE/);

  const missingToken = spawnSync(process.execPath, ["bin/pulse-api.mjs", "--once"], {
    cwd: rootPath,
    env: { ...process.env, PULSE_RUNNER_MODE: "demo", PULSE_CONFIG_PATH: "pulses.example.yaml", PULSE_STATE_PATH: "state.json" },
    encoding: "utf8",
  });
  assert.notEqual(missingToken.status, 0);
  assert.match(missingToken.stderr, /PULSE_API_TOKEN/);
});
