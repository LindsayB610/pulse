import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

const fixturePulses = [
  {
    id: "water-plants",
    title: "Water houseplants",
    active: true,
    instructions: "Use the rain barrel.",
    schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles" },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 30, snoozeEveryMinutes: 30 },
  },
  {
    id: "recycling",
    title: "Take recycling out",
    active: false,
    schedule: { type: "weekly", daysOfWeek: ["wednesday"], time: "19:00", timezone: "America/Los_Angeles" },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 60, snoozeEveryMinutes: 1440 },
  },
];

const fixtureSnapshot = {
  pulses: fixturePulses,
  checkedAt: "2026-08-09T18:00:00.000Z",
  runnerHealth: { status: "running", checkedAt: "2026-08-09T17:59:30.000Z" },
  state: {
    version: 1,
    occurrences: [
      { id: "water-plants:due", pulseId: "water-plants", dueAt: "2026-08-09T18:30:00.000Z", state: "due" },
      { id: "water-plants:done", pulseId: "water-plants", dueAt: "2026-08-02T16:30:00.000Z", state: "done", completedAt: "2026-08-02T16:48:00.000Z" },
    ],
    events: [
      { id: "evt:snooze", pulseId: "water-plants", occurrenceId: "water-plants:done", type: "occurrence_snoozed", at: "2026-08-02T16:32:00.000Z" },
      { id: "evt:done", pulseId: "water-plants", occurrenceId: "water-plants:done", type: "occurrence_completed", at: "2026-08-02T16:48:00.000Z" },
    ],
  },
};

function installDom() {
  const dom = new JSDOM("<!doctype html><html lang='en'><title>Pulse</title><body><div id=app></div></body></html>", { pretendToBeVisual: true, runScripts: "outside-only", url: "http://pulse.test" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return { dom, previous };
}

function setControlValue(control, value) {
  const prototype = control instanceof control.ownerDocument.defaultView.HTMLSelectElement
    ? control.ownerDocument.defaultView.HTMLSelectElement.prototype
    : control.ownerDocument.defaultView.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("input", { bubbles: true }));
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

async function mountedPulse(snapshot = fixtureSnapshot, onRouteChange, respond, onWorkspaceRootChange) {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseManagementView } = await import("../plugin/dist/index.js");
  const requests = [];
  const request = async (entry) => {
    requests.push(entry);
    if (respond) return respond(entry, snapshot);
    if (entry.method === "GET") return { status: 200, body: snapshot };
    if (entry.method === "POST") return { status: 201, body: { pulse: entry.body } };
    if (entry.method === "DELETE") return { status: 204, body: {} };
    return { status: 200, body: { pulse: entry.body } };
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  const render = async (activeRouteId = "reminders") => {
    await act(async () => { root.render(React.createElement(PulseManagementView, { activeRouteId, request, workspaceRoot: "/private/pulse", onRouteChange, onWorkspaceRootChange })); });
  };
  const close = async () => {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  };
  return { act, close, dom, render, requests };
}

test("mounted production Pulse UI renders a truthful management dashboard and creates reminders", async () => {
  const mounted = await mountedPulse();
  const { act, dom, render, requests } = mounted;
  try {
    await render("reminders");
    const text = dom.window.document.body.textContent;
    assert.match(text, /New reminder/);
    assert.match(text, /Runner online/);
    assert.match(text, /Water houseplants/);
    assert.match(text, /Take recycling out/);
    assert.match(text, /Due now/);
    assert.equal([...dom.window.document.querySelectorAll("button")].some((button) => /done|snooze/i.test(button.textContent)), false);

    await act(async () => { [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    assert.match(dom.window.document.body.textContent, /Create reminder/);
    await act(async () => {
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder name"]'), "Feed starter");
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder day"]'), "wednesday");
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder time"]'), "18:45");
      setControlValue(dom.window.document.querySelector('[aria-label="Repeat notification minutes"]'), "45");
      setControlValue(dom.window.document.querySelector('[aria-label="Unanswered snooze minutes"]'), "1440");
    });
    await act(async () => { dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(requests.find((entry) => entry.method === "POST"), {
      method: "POST",
      path: "/api/v1/pulses",
      body: { id: "feed-starter", title: "Feed starter", active: true, schedule: { type: "weekly", daysOfWeek: ["wednesday"], time: "18:45", timezone: "America/Los_Angeles" }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 45, snoozeEveryMinutes: 1440 } },
    });
  } finally {
    await mounted.close();
  }
});

test("production Pulse UI exposes route-specific history and settings without credentials", async () => {
  const mounted = await mountedPulse();
  try {
    await mounted.render("history");
    assert.match(mounted.dom.window.document.body.textContent, /Completion history/);
    assert.match(mounted.dom.window.document.body.textContent, /Completed after 1 snooze/);
    await mounted.render("settings");
    const text = mounted.dom.window.document.body.textContent;
    assert.match(text, /Runner is online/);
    assert.match(text, /Private Pulse folder/);
    assert.match(text, /Android push through ntfy/);
    assert.doesNotMatch(mounted.dom.window.document.documentElement.outerHTML, /authorization|bearer|test-notification-token/i);
  } finally {
    await mounted.close();
  }
});

test("connected settings truthfully reports the folder and changes it inline", async () => {
  const selected = [];
  const mounted = await mountedPulse(fixtureSnapshot, undefined, undefined, (root) => selected.push(root));
  try {
    await mounted.render("settings");
    const folderCard = [...mounted.dom.window.document.querySelectorAll(".pulse-ui__setting")]
      .find((card) => card.textContent.includes("Private Pulse folder"));
    assert.match(folderCard.textContent, /Connected/);
    assert.doesNotMatch(folderCard.textContent, /Reconnect/);
    await mounted.act(async () => {
      [...folderCard.querySelectorAll("button")].find((button) => button.textContent === "Change folder").click();
    });
    const input = mounted.dom.window.document.querySelector('[aria-label="New Pulse private folder"]');
    assert.equal(input.value, "/private/pulse");
    const useFolder = [...folderCard.querySelectorAll("button")].find((button) => button.textContent === "Use this folder");
    assert.equal(useFolder.disabled, true, "the current folder is not a fake reconnect action");
    await mounted.act(async () => { setControlValue(input, "/different/private/pulse"); });
    assert.equal(useFolder.disabled, false);
    await mounted.act(async () => { useFolder.click(); });
    assert.deepEqual(selected, ["/different/private/pulse"]);
    assert.equal(mounted.dom.window.document.querySelector('[aria-label="New Pulse private folder"]'), null);
  } finally {
    await mounted.close();
  }
});

test("production Pulse UI preserves full definitions while pausing, editing, and deleting", async () => {
  const mounted = await mountedPulse();
  const { act, dom, requests } = mounted;
  try {
    await mounted.render("reminders");
    const card = [...dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await act(async () => { [...card.querySelectorAll("button")].find((button) => button.textContent.includes("Pause")).click(); });
    assert.deepEqual(requests.find((entry) => entry.method === "PATCH")?.body, { ...fixturePulses[0], active: false });

    const refreshedCard = [...dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await act(async () => { [...refreshedCard.querySelectorAll("button")].find((button) => button.textContent.includes("Edit")).click(); });
    await act(async () => { setControlValue(dom.window.document.querySelector('[aria-label="Reminder time"]'), "10:15"); });
    await act(async () => { dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(requests.filter((entry) => entry.method === "PATCH")[1]?.body, {
      ...fixturePulses[0],
      schedule: { ...fixturePulses[0].schedule, time: "10:15" },
    });

    const updatedCard = [...dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await act(async () => { [...updatedCard.querySelectorAll("button")].find((button) => button.textContent.includes("Edit")).click(); });
    await act(async () => { dom.window.document.querySelector("[data-action='delete-reminder']").click(); });
    assert.equal(dom.window.document.querySelector("[role='dialog']")?.getAttribute("aria-modal"), "true");
    assert.match(dom.window.document.querySelector("[role='dialog']").textContent, /Delete “Water houseplants”/);
    assert.equal(dom.window.document.activeElement.textContent, "Keep reminder");
    await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
    assert.equal(dom.window.document.querySelector("[role='dialog']"), null);
    await act(async () => { dom.window.document.querySelector("[data-action='delete-reminder']").click(); });
    await act(async () => { [...dom.window.document.querySelector("[role='dialog']").querySelectorAll("button")].find((button) => button.textContent === "Delete reminder").click(); });
    assert.deepEqual(requests.find((entry) => entry.method === "DELETE"), { method: "DELETE", path: "/api/v1/pulses/water-plants" });
  } finally {
    await mounted.close();
  }
});

test("production timing presets map to the saved policy and service errors stay visible", async () => {
  const mounted = await mountedPulse(fixtureSnapshot, undefined, async (entry, snapshot) => {
    if (entry.method === "GET") return { status: 200, body: snapshot };
    return { status: 409, body: { error: "A reminder with that id already exists." } };
  });
  try {
    await mounted.render("reminders");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    await mounted.act(async () => {
      setControlValue(mounted.dom.window.document.querySelector('[aria-label="Reminder name"]'), "Existing reminder");
      const snoozePresets = mounted.dom.window.document.querySelector('[aria-label="Snooze and no action presets"]');
      [...snoozePresets.querySelectorAll("button")].find((button) => button.textContent === "1 day").click();
    });
    assert.equal(mounted.dom.window.document.querySelector('[aria-label="Unanswered snooze minutes"]').value, "1440");
    await mounted.act(async () => { mounted.dom.window.document.querySelector("form").dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const createRequest = mounted.requests.find((entry) => entry.method === "POST");
    assert.equal(createRequest.body.notificationPolicy.snoozeEveryMinutes, 1440);
    assert.match(mounted.dom.window.document.querySelector("[role='alert']").textContent, /already exists/);
  } finally {
    await mounted.close();
  }
});

test("production UI gives empty and unavailable states an actionable explanation", async () => {
  const mounted = await mountedPulse({ pulses: [], runnerHealth: { status: "unknown", checkedAt: "2026-08-09T18:00:00.000Z" }, state: { version: 1, occurrences: [], events: [] } });
  try {
    await mounted.render("reminders");
    assert.match(mounted.dom.window.document.body.textContent, /No reminders yet/);
    assert.match(mounted.dom.window.document.body.textContent, /Create your first reminder/);
    assert.match(mounted.dom.window.document.body.textContent, /Status unavailable/);
    await mounted.render("settings");
    assert.match(mounted.dom.window.document.body.textContent, /Runner status unavailable/);
    assert.match(mounted.dom.window.document.body.textContent, /has not received a current health report/);
  } finally {
    await mounted.close();
  }
});

test("production connection screen explains the private boundary and submits the selected folder", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { WorkshopToolView } = await import("../plugin/dist/index.js");
  const selected = [];
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(WorkshopToolView, { requestWorkspaceRoot: (value) => selected.push(value) })); });
    const text = dom.window.document.body.textContent;
    assert.match(text, /Connect your reminders/);
    assert.match(text, /Credentials stay in the macOS Keychain/);
    assert.doesNotMatch(text, /New reminder/);
    await act(async () => {
      setControlValue(dom.window.document.querySelector('[aria-label="Pulse private folder"]'), "/private/pulse");
      [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("Connect Pulse")).click();
    });
    assert.deepEqual(selected, ["/private/pulse"]);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("production connection restores the Pulse-owned private folder without hardcoding it", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { WorkshopToolView } = await import("../plugin/dist/index.js");
  dom.window.localStorage.setItem("pulse.privateWorkspaceRoot.v1", "/remembered/private/pulse");
  const selected = [];
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(WorkshopToolView, { requestWorkspaceRoot: (value) => selected.push(value) })); });
    assert.equal(dom.window.document.querySelector('[aria-label="Pulse private folder"]').value, "/remembered/private/pulse");
    assert.deepEqual(selected, ["/remembered/private/pulse"]);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("WorkshopToolView changes a connected folder by value without invoking an undefined host prompt", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { WorkshopToolView } = await import("../plugin/dist/index.js");
  const hostCalls = [];
  dom.window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      hostCalls.push({ command, args });
      if (command === "read_secure_service_metadata") return { endpoint: "https://pulse.example" };
      if (command === "request_configured_secure_service") return { status: 200, body: fixtureSnapshot };
      throw new Error(`Unexpected host command: ${command}`);
    },
  };
  const selected = [];
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => {
      root.render(React.createElement(WorkshopToolView, {
        activeRouteId: "settings",
        workspaceRoot: "/private/pulse",
        requestWorkspaceRoot: (value) => selected.push(value),
      }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    assert.match(dom.window.document.body.textContent, /Pulse settings/);
    await act(async () => {
      [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Change folder").click();
    });
    await act(async () => {
      setControlValue(dom.window.document.querySelector('[aria-label="New Pulse private folder"]'), "/replacement/private/pulse");
    });
    await act(async () => {
      [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Use this folder").click();
    });
    assert.deepEqual(selected, ["/replacement/private/pulse"]);
    assert.equal(selected.includes(undefined), false);
    assert.equal(dom.window.localStorage.getItem("pulse.privateWorkspaceRoot.v1"), "/replacement/private/pulse");
    assert.equal(hostCalls.some((call) => call.command === "read_secure_service_metadata"), true);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test("production navigation reports its route to Workshop and distinguishes a stale runner", async () => {
  const staleSnapshot = { ...fixtureSnapshot, runnerHealth: { status: "stale", checkedAt: "2026-08-09T16:00:00.000Z" } };
  const routeEvents = [];
  const mounted = await mountedPulse(staleSnapshot, (route) => routeEvents.push(route));
  try {
    await mounted.render("reminders");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Settings").click(); });
    assert.deepEqual(routeEvents, ["settings"]);
    assert.match(mounted.dom.window.document.body.textContent, /Runner heartbeat is stale/);
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Reminders").click(); });
    assert.match(mounted.dom.window.document.body.textContent, /Runner stale/);
  } finally {
    await mounted.close();
  }
});

test("production dashboard, editor, and folder settings have no automated accessibility violations", async () => {
  const mounted = await mountedPulse(fixtureSnapshot, undefined, undefined, () => {});
  try {
    await mounted.render("reminders");
    const axe = await readFile(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
    mounted.dom.window.eval(axe);
    let result = await mounted.dom.window.axe.run(mounted.dom.window.document, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(Array.from(result.violations, (violation) => violation.id), []);
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    result = await mounted.dom.window.axe.run(mounted.dom.window.document, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(Array.from(result.violations, (violation) => violation.id), []);
    await mounted.render("settings");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Change folder").click(); });
    result = await mounted.dom.window.axe.run(mounted.dom.window.document, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(Array.from(result.violations, (violation) => violation.id), []);
  } finally {
    await mounted.close();
  }
});
