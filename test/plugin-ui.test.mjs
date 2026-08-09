import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

const fixturePulses = [
  {
    id: "water-plants",
    title: "Water houseplants",
    active: true,
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

async function mountedPulse(snapshot = fixtureSnapshot, onRouteChange) {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseManagementView } = await import("../plugin/dist/index.js");
  const requests = [];
  const request = async (entry) => {
    requests.push(entry);
    if (entry.method === "GET") return { status: 200, body: snapshot };
    if (entry.method === "POST") return { status: 201, body: { pulse: entry.body } };
    if (entry.method === "DELETE") return { status: 204, body: {} };
    return { status: 200, body: { pulse: entry.body } };
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  const render = async (activeRouteId = "reminders") => {
    await act(async () => { root.render(React.createElement(PulseManagementView, { activeRouteId, request, workspaceRoot: "/private/pulse", onRouteChange })); });
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

test("production Pulse UI preserves full definitions while pausing and confirms deletion", async () => {
  const mounted = await mountedPulse();
  const { act, dom, requests } = mounted;
  try {
    await mounted.render("reminders");
    const card = [...dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await act(async () => { [...card.querySelectorAll("button")].find((button) => button.textContent.includes("Pause")).click(); });
    assert.deepEqual(requests.find((entry) => entry.method === "PATCH")?.body, { ...fixturePulses[0], active: false });

    await act(async () => { [...card.querySelectorAll("button")].find((button) => button.textContent.includes("Edit")).click(); });
    await act(async () => { dom.window.document.querySelector("[data-action='delete-reminder']").click(); });
    assert.equal(dom.window.document.querySelector("[role='dialog']")?.getAttribute("aria-modal"), "true");
    assert.match(dom.window.document.querySelector("[role='dialog']").textContent, /Delete “Water houseplants”/);
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

test("production dashboard has no automated accessibility violations", async () => {
  const mounted = await mountedPulse();
  try {
    await mounted.render("reminders");
    const axe = await readFile(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
    mounted.dom.window.eval(axe);
    const result = await mounted.dom.window.axe.run(mounted.dom.window.document, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    assert.deepEqual(Array.from(result.violations, (violation) => violation.id), []);
  } finally {
    await mounted.close();
  }
});
