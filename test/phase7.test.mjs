import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  createMemoryPulseStateStore,
  createPulseUiServer,
  renderPulseManagementPage,
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
      channels: ["sms"],
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
          channel: "sms",
          ok: true,
          detail: "sent to [redacted]",
        },
      },
    ],
  };
}

test("phase 7 UI renders due, upcoming, history, notification state, and no snooze controls", () => {
  const html = renderPulseManagementPage({
    pulses,
    state: createUiFixture(),
    now,
    runnerHealth: {
      status: "running",
      checkedAt: now,
    },
  });

  assert.match(html, /Weekly check/);
  assert.match(html, /Confirm the weekly task is complete\./);
  assert.match(html, /Upcoming check/);
  assert.match(html, /Finished last week\./);
  assert.match(html, /Last notification/);
  assert.match(html, /sms/);
  assert.match(html, /running/);
  assert.match(html, /name="completionNote"/);
  assert.doesNotMatch(html, /snooze/i);
  assert.doesNotMatch(html, /dismiss/i);
});

test("phase 7 Done action records completion, moves occurrence to history, and stops active state", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
  });

  const response = await ui.handle(
    new Request("http://pulse.local/occurrences/weekly-check%3A2026-06-28T13%3A00%3A00.000Z/done", {
      method: "POST",
      body: new URLSearchParams({ completionNote: "Done from UI." }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    }),
  );
  const state = stateStore.read();
  const completed = state.occurrences.find(
    (occurrence) => occurrence.id === "weekly-check:2026-06-28T13:00:00.000Z",
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  assert.equal(completed?.state, "done");
  assert.equal(completed?.completionNote, "Done from UI.");
  assert.equal(state.events.at(-1)?.type, "occurrence_completed");

  const html = await (await ui.handle(new Request("http://pulse.local/"))).text();
  assert.match(html, /Done from UI\./);
  assert.doesNotMatch(html, /value="weekly-check:2026-06-28T13:00:00.000Z"/);
});

test("phase 7 Done action handles stale completion attempts without a server error", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
  });
  const request = () =>
    new Request("http://pulse.local/occurrences/weekly-check%3A2026-06-28T13%3A00%3A00.000Z/done", {
      method: "POST",
      body: new URLSearchParams({ completionNote: "Double submit." }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });

  assert.equal((await ui.handle(request())).status, 303);
  const staleResponse = await ui.handle(request());
  const state = stateStore.read();

  assert.equal(staleResponse.status, 409);
  assert.match(await staleResponse.text(), /already done/i);
  assert.equal(state.events.filter((event) => event.type === "occurrence_completed").length, 1);
});

test("phase 7 UI listen serves the management page over local HTTP", async () => {
  const stateStore = createMemoryPulseStateStore(createUiFixture());
  const ui = createPulseUiServer({
    pulses,
    stateStore,
    now: () => now,
  });
  const running = await ui.listen({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`http://127.0.0.1:${running.port}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Weekly check/);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  } finally {
    await running.close();
  }
});

test("phase 7 UI command starts with private config and state paths", () => {
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
    const result = spawnSync(process.execPath, ["bin/pulse-ui.mjs", "--once"], {
      cwd: rootPath,
      env: {
        ...process.env,
        PULSE_CONFIG_PATH: configPath,
        PULSE_STATE_PATH: statePath,
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"ui":true/);
    assert.match(result.stdout, /"port":8787/);
    assert.match(readFileSync(statePath, "utf8"), /weekly-check/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
