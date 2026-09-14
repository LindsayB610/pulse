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
    definitionRevision: 1,
    seriesRevision: 1,
    schedule: { version: 2, type: "weekly", interval: 1, startDate: "2026-08-02", weekStartsOn: "sunday", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles", end: { type: "count", occurrences: 30 } },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 30, snoozeEveryMinutes: 30 },
  },
  {
    id: "recycling",
    title: "Take recycling out",
    active: false,
    definitionRevision: 1,
    seriesRevision: 1,
    schedule: { version: 2, type: "weekly", interval: 1, startDate: "2026-08-05", weekStartsOn: "sunday", daysOfWeek: ["wednesday"], time: "19:00", timezone: "America/Los_Angeles", end: { type: "count", occurrences: 12 } },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 60, snoozeEveryMinutes: 1440 },
  },
];

const fixtureSnapshot = {
  pulses: fixturePulses,
  checkedAt: "2026-08-09T18:00:00.000Z",
  runnerHealth: { status: "running", checkedAt: "2026-08-09T17:59:30.000Z" },
  state: {
    version: 2,
    occurrences: [
      { id: "water-plants:due", pulseId: "water-plants", dueAt: "2026-08-09T18:30:00.000Z", state: "due" },
      { id: "water-plants:done", pulseId: "water-plants", dueAt: "2026-08-02T16:30:00.000Z", state: "done", completedAt: "2026-08-02T16:48:00.000Z" },
    ],
    events: [
      { id: "evt:snooze", pulseId: "water-plants", occurrenceId: "water-plants:done", type: "occurrence_snoozed", at: "2026-08-02T16:32:00.000Z" },
      { id: "evt:done", pulseId: "water-plants", occurrenceId: "water-plants:done", type: "occurrence_completed", at: "2026-08-02T16:48:00.000Z" },
    ],
  },
  seriesProgress: {
    "water-plants": { generated: 2, remaining: 28, complete: false },
    recycling: { generated: 0, remaining: 12, complete: false },
  },
  recurrenceMigration: { required: false, legacyPulseIds: [] },
};

function installDom() {
  const dom = new JSDOM("<!doctype html><html lang='en'><title>Pulse</title><body><div id=app></div></body></html>", { pretendToBeVisual: true, runScripts: "outside-only", url: "http://pulse.test" });
  const previous = { window: globalThis.window, document: globalThis.document, customEvent: globalThis.CustomEvent, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
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

async function waitFor(act, predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
  assert.fail(message);
}

function addIsoDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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
    globalThis.CustomEvent = previous.customEvent;
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
    const pausedCard = [...dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Take recycling out"));
    assert.equal(pausedCard.classList.contains("pulse-ui__card--paused"), true);
    assert.ok(pausedCard.querySelector(".pulse-ui__card-main"));

    await act(async () => { [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    assert.match(dom.window.document.body.textContent, /Create reminder/);
    const reminderDate = dom.window.document.querySelector("[data-field='date']").dataset.value;
    await act(async () => {
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder name"]'), "Feed starter");
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder time"]'), "18:45");
      setControlValue(dom.window.document.querySelector('[aria-label="Unanswered snooze minutes"]'), "1440");
    });
    await act(async () => { dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(requests.find((entry) => entry.method === "POST"), {
      method: "POST",
      path: "/api/v1/pulses",
      body: { id: "feed-starter", title: "Feed starter", active: true, schedule: { version: 2, type: "once", date: reminderDate, time: "18:45", timezone: "America/Los_Angeles" }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 1440 } },
    });
  } finally {
    await mounted.close();
  }
});

test("recurrence is explicit, progressively disclosed, and always bounded", async () => {
  const mounted = await mountedPulse();
  try {
    await mounted.render("reminders");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    const repeat = [...mounted.dom.window.document.querySelectorAll('input[type="checkbox"]')].find((input) => input.closest("label")?.textContent.includes("Repeat this reminder"));
    assert.equal(repeat.checked, false);
    assert.equal(mounted.dom.window.document.querySelector("#pulse-recurrence-panel"), null);
    await mounted.act(async () => { repeat.click(); });
    assert.equal(repeat.getAttribute("aria-expanded"), "true");
    assert.ok(mounted.dom.window.document.querySelector("#pulse-recurrence-panel"));
    const countEnding = mounted.dom.window.document.querySelectorAll('input[name="series-end"]')[0];
    const dateEnding = mounted.dom.window.document.querySelectorAll('input[name="series-end"]')[1];
    const countInput = mounted.dom.window.document.querySelector('[aria-label="Number of reminders"]');
    const endDateInput = mounted.dom.window.document.querySelector('[data-field="end-date"]');
    assert.equal(countInput.disabled, false);
    assert.equal(endDateInput.disabled, true);
    await mounted.act(async () => {
      setControlValue(mounted.dom.window.document.querySelector('[aria-label="Reminder name"]'), "Team check-in");
      setControlValue(mounted.dom.window.document.querySelector('[aria-label="Repeat frequency"]'), "weekly");
      const monday = mounted.dom.window.document.querySelector('button[aria-label="Monday"]');
      const wednesday = mounted.dom.window.document.querySelector('button[aria-label="Wednesday"]');
      if (monday.getAttribute("aria-pressed") !== "true") monday.click();
      if (wednesday.getAttribute("aria-pressed") !== "true") wednesday.click();
      setControlValue(mounted.dom.window.document.querySelector('[aria-label="Number of reminders"]'), "8");
    });
    await waitFor(mounted.act, () => /8 reminders/.test(mounted.dom.window.document.querySelector(".pulse-ui__recurrence-preview")?.textContent ?? ""), "debounced recurrence preview becomes visible");
    assert.equal(mounted.dom.window.document.querySelectorAll(".pulse-ui__preview-dates time").length, 3);
    const reminderDate = mounted.dom.window.document.querySelector('[data-field="date"]').dataset.value;
    assert.ok(endDateInput.dataset.value >= reminderDate);
    await mounted.act(async () => { dateEnding.click(); });
    assert.equal(countInput.disabled, true);
    assert.equal(endDateInput.disabled, false);
    assert.ok(endDateInput.dataset.value >= reminderDate);
    await mounted.act(async () => { countEnding.click(); });
    await mounted.act(async () => { mounted.dom.window.document.querySelector("form").dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const created = mounted.requests.find((entry) => entry.method === "POST" && entry.path === "/api/v1/pulses");
    assert.equal(created.body.schedule.version, 2);
    assert.equal(created.body.schedule.type, "weekly");
    assert.equal(created.body.schedule.end.occurrences, 8);
    assert.ok(created.body.schedule.daysOfWeek.includes("monday"));
    assert.ok(created.body.schedule.daysOfWeek.includes("wednesday"));
  } finally {
    await mounted.close();
  }
});

test("choosing a new start date updates the untouched weekly default", async () => {
  const mounted = await mountedPulse();
  try {
    await mounted.render("reminders");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    const nextDate = addIsoDays(trigger.dataset.value, 1);
    const expectedDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${nextDate}T00:00:00Z`).getUTCDay()];
    await mounted.act(async () => trigger.click());
    await mounted.act(async () => mounted.dom.window.document.querySelector(`[data-date='${nextDate}']`).click());
    const repeat = [...mounted.dom.window.document.querySelectorAll('input[type="checkbox"]')].find((input) => input.closest("label")?.textContent.includes("Repeat this reminder"));
    await mounted.act(async () => repeat.click());
    assert.equal(mounted.dom.window.document.querySelector(`button[aria-label='${expectedDay}']`).getAttribute("aria-pressed"), "true");
    assert.equal([...mounted.dom.window.document.querySelectorAll(".pulse-ui__weekdays button[aria-pressed='true']")].length, 1);
  } finally {
    await mounted.close();
  }
});

test("the weekdays preset remains deliberate after the start date changes", async () => {
  const mounted = await mountedPulse();
  try {
    await mounted.render("reminders");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    const repeat = [...mounted.dom.window.document.querySelectorAll('input[type="checkbox"]')].find((input) => input.closest("label")?.textContent.includes("Repeat this reminder"));
    await mounted.act(async () => repeat.click());
    await mounted.act(async () => setControlValue(mounted.dom.window.document.querySelector('[aria-label="Repeat frequency"]'), "daily"));
    await mounted.act(async () => [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("Use weekdays")).click());
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    const nextDate = addIsoDays(trigger.dataset.value, 1);
    await mounted.act(async () => trigger.click());
    await mounted.act(async () => mounted.dom.window.document.querySelector(`[data-date='${nextDate}']`).click());
    assert.deepEqual([...mounted.dom.window.document.querySelectorAll(".pulse-ui__weekdays button[aria-pressed='true']")].map((button) => button.getAttribute("aria-label")), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  } finally {
    await mounted.close();
  }
});

test("legacy reminders block ordinary editing until every schedule is explicitly classified", async () => {
  const legacySnapshot = {
    ...fixtureSnapshot,
    pulses: fixturePulses.map((pulse) => ({ ...pulse, definitionRevision: undefined, seriesRevision: undefined, schedule: { type: "weekly", daysOfWeek: pulse.schedule.daysOfWeek, time: pulse.schedule.time, timezone: pulse.schedule.timezone } })),
    recurrenceMigration: { required: true, legacyPulseIds: fixturePulses.map((pulse) => pulse.id) },
  };
  const mounted = await mountedPulse(legacySnapshot);
  try {
    await mounted.render("reminders");
    assert.match(mounted.dom.window.document.body.textContent, /Finish updating your reminder schedules/);
    assert.equal([...mounted.dom.window.document.querySelectorAll("button")].some((button) => button.textContent.includes("New reminder")), false);
    const cards = [...mounted.dom.window.document.querySelectorAll(".pulse-ui__migration-card")];
    await mounted.act(async () => {
      cards[0].querySelectorAll('input[type="radio"]')[0].click();
      cards[1].querySelectorAll('input[type="radio"]')[1].click();
    });
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Update all schedules").click(); });
    const request = mounted.requests.find((entry) => entry.path === "/api/v1/migrations/recurrence");
    assert.deepEqual(request.body.classifications.map((value) => [value.id, value.mode]), [["water-plants", "once"], ["recycling", "repeat"]]);
  } finally {
    await mounted.close();
  }
});

test("legacy schedule migration acknowledges one accepted submit and ignores duplicate activation", async () => {
  const legacySnapshot = {
    ...fixtureSnapshot,
    pulses: fixturePulses.map((pulse) => ({ ...pulse, definitionRevision: undefined, seriesRevision: undefined, schedule: { type: "weekly", daysOfWeek: pulse.schedule.daysOfWeek, time: pulse.schedule.time, timezone: pulse.schedule.timezone } })),
    recurrenceMigration: { required: true, legacyPulseIds: fixturePulses.map((pulse) => pulse.id) },
  };
  let resolveMigration;
  const migrationPending = new Promise((resolve) => { resolveMigration = resolve; });
  const mounted = await mountedPulse(legacySnapshot, undefined, async (entry, snapshot) => {
    if (entry.path === "/api/v1/snapshot") return { status: 200, body: snapshot };
    if (entry.path === "/api/v1/migrations/recurrence") return migrationPending;
    return { status: 200, body: {} };
  });
  try {
    await mounted.render("reminders");
    const cards = [...mounted.dom.window.document.querySelectorAll(".pulse-ui__migration-card")];
    await mounted.act(async () => {
      cards[0].querySelectorAll('input[type="radio"]')[0].click();
      cards[1].querySelectorAll('input[type="radio"]')[1].click();
    });
    const update = [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Update all schedules");
    await mounted.act(async () => { update.click(); update.click(); update.click(); });
    assert.equal(mounted.requests.filter((entry) => entry.path === "/api/v1/migrations/recurrence").length, 1);
    assert.equal(update.textContent.trim(), "Updating…");
    assert.equal(update.disabled, true);
    assert.equal(update.getAttribute("aria-busy"), "true");
    await mounted.act(async () => { resolveMigration({ status: 200, body: {} }); await migrationPending; });
  } finally {
    await mounted.close();
  }
});

test("completed sets stay visible but never renew automatically", async () => {
  const finished = {
    ...fixtureSnapshot,
    seriesProgress: { ...fixtureSnapshot.seriesProgress, "water-plants": { generated: 30, remaining: 0, complete: true } },
    state: { ...fixtureSnapshot.state, occurrences: fixtureSnapshot.state.occurrences.map((occurrence) => occurrence.pulseId === "water-plants" ? { ...occurrence, state: "done", completedAt: occurrence.completedAt ?? "2026-08-09T18:31:00.000Z", final: true } : occurrence) },
  };
  const mounted = await mountedPulse(finished);
  try {
    await mounted.render("reminders");
    assert.match(mounted.dom.window.document.body.textContent, /Finished/);
    await mounted.act(async () => { mounted.dom.window.document.querySelector(".pulse-ui__finished > summary").click(); });
    assert.match(mounted.dom.window.document.body.textContent, /will not restart by itself/);
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Add another set").click(); });
    assert.match(mounted.dom.window.document.body.textContent, /Add another set for Water houseplants/);
    const renewalDate = mounted.dom.window.document.querySelector('[data-field="date"]').dataset.value;
    await mounted.act(async () => { mounted.dom.window.document.querySelector("form").dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const confirmation = mounted.dom.window.document.querySelector("[role='dialog']");
    assert.match(confirmation.textContent, /weekly schedule becomes the active schedule/i);
    await mounted.act(async () => { [...confirmation.querySelectorAll("button")].find((button) => button.textContent === "Update schedule").click(); });
    const renewal = mounted.requests.find((entry) => entry.method === "PATCH");
    assert.equal(renewal.body.schedule.startDate, renewalDate);
    assert.equal(renewal.body.schedule.end.occurrences, 30);
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
    const settingsLede = mounted.dom.window.document.querySelector("#pulse-settings-heading").closest("header").querySelector(".pulse-ui__lede");
    assert.equal(settingsLede.classList.contains("pulse-ui__lede--wide"), true);
    assert.match(text, /Runner is online/);
    assert.match(text, /Advanced private Pulse folder/);
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
      .find((card) => card.textContent.includes("Advanced private Pulse folder"));
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

test("G6 settings creates a bound additional-Mac invitation and sends isolated tests", async () => {
  const mounted = await mountedPulse(fixtureSnapshot, undefined, async (entry, snapshot) => {
    if (entry.method === "GET") return { status: 200, body: snapshot };
    if (entry.path === "/api/setup/clients") return { status: 201, body: { code: "PULSE-FIXTURE-INVITATION", expiresAt: "2026-08-09T18:10:00.000Z" } };
    if (entry.path === "/api/setup/test-notification") return { status: 202, body: { accepted: true } };
    return { status: 400, body: {} };
  });
  const copied = [];
  Object.defineProperty(mounted.dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async (value) => copied.push(value) } });
  try {
    await mounted.render("settings");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((candidate) => candidate.textContent === "Add a Mac").click(); });
    const input = mounted.dom.window.document.querySelector('[aria-label="Other Mac installation id"]');
    await mounted.act(async () => { setControlValue(input, "installation_second_mac"); });
    await mounted.act(async () => { input.closest("form").dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(mounted.requests.find((entry) => entry.method === "POST" && entry.path === "/api/setup/clients"), {
      method: "POST",
      path: "/api/setup/clients",
      body: { installationId: "installation_second_mac" },
    });
    assert.match(mounted.dom.window.document.body.textContent, /PULSE-FIXTURE-INVITATION/);
    assert.match(mounted.dom.window.document.body.textContent, /expires in ten minutes/i);
    const copyInvitation = [...mounted.dom.window.document.querySelectorAll("button")].find((candidate) => candidate.textContent.includes("Copy invitation"));
    assert.ok(copyInvitation.querySelector("svg"));
    await mounted.act(async () => { copyInvitation.click(); });
    assert.deepEqual(copied, ["PULSE-FIXTURE-INVITATION"]);
    assert.match(mounted.dom.window.document.body.textContent, /Invitation code copied/);
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((candidate) => candidate.textContent === "Send test").click(); });
    assert.ok(mounted.requests.some((entry) => entry.path === "/api/setup/test-notification"));
    assert.match(mounted.dom.window.document.body.textContent, /Test sent/);
  } finally {
    await mounted.close();
  }
});

test("G6 managed disconnect requires explicit confirmation and states that the remote runner remains", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseManagementView } = await import("../plugin/dist/index.js");
  let disconnects = 0;
  const root = createRoot(dom.window.document.getElementById("app"));
  const request = async (entry) => entry.path === "/api/setup/clients"
    ? { status: 200, body: { clients: [], currentClientId: "client_current" } }
    : { status: 200, body: fixtureSnapshot };
  try {
    await act(async () => { root.render(React.createElement(PulseManagementView, { activeRouteId: "settings", request, onDisconnect: async () => { disconnects += 1; } })); });
    const first = [...dom.window.document.querySelectorAll("button")].find((candidate) => candidate.textContent === "Disconnect this Mac");
    await act(async () => { first.click(); });
    assert.equal(disconnects, 0);
    assert.match(dom.window.document.body.textContent, /provider billing keep running/i);
    const confirmations = [...dom.window.document.querySelectorAll("button")].filter((candidate) => candidate.textContent === "Disconnect this Mac");
    await act(async () => { confirmations.at(-1).click(); });
    assert.equal(disconnects, 1);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
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
    await act(async () => { [...dom.window.document.querySelector("[role='dialog']").querySelectorAll("button")].find((button) => button.textContent === "Update schedule").click(); });
    assert.deepEqual(requests.filter((entry) => entry.method === "PATCH")[1]?.body, {
      ...fixturePulses[0],
      schedule: { ...fixturePulses[0].schedule, time: "10:15" },
      notificationPolicy: { ...fixturePulses[0].notificationPolicy, repeatEveryMinutes: 5 },
    });

    const updatedCard = [...dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await act(async () => { [...updatedCard.querySelectorAll("button")].find((button) => button.textContent.includes("Edit")).click(); });
    const deleteTrigger = dom.window.document.querySelector("[data-action='delete-reminder']");
    deleteTrigger.focus();
    await act(async () => { deleteTrigger.click(); });
    assert.equal(dom.window.document.querySelector("[role='dialog']")?.getAttribute("aria-modal"), "true");
    assert.match(dom.window.document.querySelector("[role='dialog']").textContent, /Delete “Water houseplants”/);
    assert.equal(dom.window.document.activeElement.textContent, "Keep reminder");
    await act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
    assert.equal(dom.window.document.querySelector("[role='dialog']"), null);
    assert.equal(dom.window.document.activeElement, deleteTrigger, "closing a destructive dialog restores the invoking control");
    await act(async () => { dom.window.document.querySelector("[data-action='delete-reminder']").click(); });
    await act(async () => { [...dom.window.document.querySelector("[role='dialog']").querySelectorAll("button")].find((button) => button.textContent === "Delete reminder").click(); });
    assert.deepEqual(requests.find((entry) => entry.method === "DELETE"), { method: "DELETE", path: "/api/v1/pulses/water-plants" });
  } finally {
    await mounted.close();
  }
});

test("production network actions are single-flight even when activated twice in one render", async () => {
  let resolveCreate;
  let resolveTest;
  const createPending = new Promise((resolve) => { resolveCreate = resolve; });
  const testPending = new Promise((resolve) => { resolveTest = resolve; });
  const mounted = await mountedPulse(fixtureSnapshot, undefined, async (entry, snapshot) => {
    if (entry.path === "/api/v1/snapshot") return { status: 200, body: snapshot };
    if (entry.path === "/api/setup/clients" && entry.method === "GET") return { status: 200, body: { clients: [] } };
    if (entry.path === "/api/v1/pulses" && entry.method === "POST") return createPending;
    if (entry.path === "/api/setup/test-notification") return testPending;
    return { status: 200, body: {} };
  });
  try {
    await mounted.render("reminders");
    await mounted.act(async () => { [...mounted.dom.window.document.querySelectorAll("button")].find((item) => item.textContent.includes("New reminder")).click(); });
    await mounted.act(async () => { setControlValue(mounted.dom.window.document.querySelector('[aria-label="Reminder name"]'), "Single flight"); });
    const form = mounted.dom.window.document.querySelector("form");
    await mounted.act(async () => {
      form.dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(mounted.requests.filter((entry) => entry.path === "/api/v1/pulses" && entry.method === "POST").length, 1);
    assert.equal([...form.querySelectorAll("button")].find((item) => item.textContent === "Saving…")?.disabled, true);
    await mounted.act(async () => { resolveCreate({ status: 201, body: {} }); await createPending; });

    await mounted.render("settings");
    const testButton = [...mounted.dom.window.document.querySelectorAll("button")].find((item) => item.textContent === "Send test");
    await mounted.act(async () => { testButton.click(); testButton.click(); });
    assert.equal(mounted.requests.filter((entry) => entry.path === "/api/setup/test-notification").length, 1);
    assert.equal(testButton.disabled, true);
    assert.equal(testButton.textContent.trim(), "Sending…");
    assert.equal(testButton.getAttribute("aria-busy"), "true");
    await mounted.act(async () => { resolveTest({ status: 202, body: { accepted: true } }); await testPending; });
    assert.match(mounted.dom.window.document.body.textContent, /Test sent/);
  } finally {
    await mounted.close();
  }
});

test("delete acknowledges the first click immediately and rejects duplicate activation", async () => {
  let resolveDelete;
  const deletePending = new Promise((resolve) => { resolveDelete = resolve; });
  const mounted = await mountedPulse(fixtureSnapshot, undefined, async (entry, snapshot) => {
    if (entry.path === "/api/v1/snapshot") return { status: 200, body: snapshot };
    if (entry.method === "DELETE") return deletePending;
    return { status: 200, body: {} };
  });
  try {
    await mounted.render("reminders");
    const card = [...mounted.dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await mounted.act(async () => { [...card.querySelectorAll("button")].find((button) => button.textContent === "Edit").click(); });
    await mounted.act(async () => { mounted.dom.window.document.querySelector("[data-action='delete-reminder']").click(); });
    const confirm = [...mounted.dom.window.document.querySelector("[role='dialog']").querySelectorAll("button")].find((button) => button.textContent === "Delete reminder");
    await mounted.act(async () => { confirm.click(); confirm.click(); confirm.click(); });
    assert.equal(mounted.requests.filter((entry) => entry.method === "DELETE").length, 1);
    assert.equal(confirm.textContent.trim(), "Deleting…");
    assert.equal(confirm.disabled, true);
    assert.equal(confirm.getAttribute("aria-busy"), "true");
    assert.equal([...mounted.dom.window.document.querySelector("[role='dialog']").querySelectorAll("button")].find((button) => button.textContent === "Keep reminder").disabled, true);
    await mounted.act(async () => { resolveDelete({ status: 204, body: {} }); await deletePending; });
    assert.equal(mounted.dom.window.document.querySelector("[role='dialog']"), null);
    assert.match(mounted.dom.window.document.body.textContent, /Reminder deleted/);
  } finally {
    await mounted.close();
  }
});

test("refresh and reminder toggles expose the accepted action while remaining single-flight", async () => {
  let snapshotReads = 0;
  let resolveRefresh;
  let resolvePause;
  const refreshPending = new Promise((resolve) => { resolveRefresh = resolve; });
  const pausePending = new Promise((resolve) => { resolvePause = resolve; });
  const mounted = await mountedPulse(fixtureSnapshot, undefined, async (entry, snapshot) => {
    if (entry.path === "/api/v1/snapshot") {
      snapshotReads += 1;
      return snapshotReads === 1 ? { status: 200, body: snapshot } : refreshPending;
    }
    if (entry.method === "PATCH") return pausePending;
    return { status: 200, body: {} };
  });
  try {
    await mounted.render("reminders");
    const refresh = [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Refresh");
    await mounted.act(async () => { refresh.click(); refresh.click(); refresh.click(); });
    assert.equal(snapshotReads, 2);
    assert.equal(refresh.textContent.trim(), "Refreshing…");
    assert.equal(refresh.disabled, true);
    assert.equal(refresh.getAttribute("aria-busy"), "true");
    await mounted.act(async () => { resolveRefresh({ status: 200, body: fixtureSnapshot }); await refreshPending; });

    const card = [...mounted.dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    const pause = [...card.querySelectorAll("button")].find((button) => button.textContent === "Pause");
    await mounted.act(async () => { pause.click(); pause.click(); pause.click(); });
    assert.equal(mounted.requests.filter((entry) => entry.method === "PATCH").length, 1);
    assert.equal(pause.textContent.trim(), "Pausing…");
    assert.equal(pause.disabled, true);
    assert.equal(pause.getAttribute("aria-busy"), "true");
    await mounted.act(async () => { resolvePause({ status: 200, body: {} }); await pausePending; });
    await mounted.act(async () => { resolveRefresh({ status: 200, body: fixtureSnapshot }); });
  } finally {
    await mounted.close();
  }
});

test("confirmed schedule edits remain single-flight under duplicate activation", async () => {
  let resolveUpdate;
  const updatePending = new Promise((resolve) => { resolveUpdate = resolve; });
  const mounted = await mountedPulse(fixtureSnapshot, undefined, async (entry, snapshot) => {
    if (entry.path === "/api/v1/snapshot") return { status: 200, body: snapshot };
    if (entry.method === "PATCH") return updatePending;
    return { status: 200, body: {} };
  });
  try {
    await mounted.render("reminders");
    const card = [...mounted.dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await mounted.act(async () => { [...card.querySelectorAll("button")].find((button) => button.textContent === "Edit").click(); });
    await mounted.act(async () => { setControlValue(mounted.dom.window.document.querySelector('[aria-label="Reminder time"]'), "10:15"); });
    await mounted.act(async () => { mounted.dom.window.document.querySelector("form").dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const confirm = [...mounted.dom.window.document.querySelector("[role='dialog']").querySelectorAll("button")]
      .find((button) => button.textContent === "Update schedule");
    await mounted.act(async () => { confirm.click(); confirm.click(); });
    assert.equal(mounted.requests.filter((entry) => entry.method === "PATCH").length, 1);
    assert.equal(confirm.disabled, true);
    await mounted.act(async () => { resolveUpdate({ status: 200, body: {} }); await updatePending; });
  } finally {
    await mounted.close();
  }
});

test("production UI discards malformed snapshot records instead of crashing", async () => {
  const malformed = {
    pulses: [null, { id: 17, title: "bad" }, fixturePulses[0]],
    runnerHealth: { status: "running", checkedAt: "not-a-date" },
    state: {
      occurrences: [null, { id: "broken", pulseId: "water-plants", dueAt: null, state: "due" }, fixtureSnapshot.state.occurrences[1]],
      events: [null, "broken", fixtureSnapshot.state.events[1]],
    },
  };
  const mounted = await mountedPulse(malformed);
  try {
    await mounted.render("reminders");
    assert.match(mounted.dom.window.document.body.textContent, /Water houseplants/);
    assert.doesNotMatch(mounted.dom.window.document.body.textContent, /bad/);
    await mounted.render("history");
    assert.match(mounted.dom.window.document.body.textContent, /Completed on the first notification/);
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
    assert.equal(mounted.dom.window.document.querySelector('[aria-label="Reminder name"]').value, "Existing reminder", "failed saves retain the draft");
    assert.equal(mounted.dom.window.document.activeElement, mounted.dom.window.document.querySelector('[aria-label="Reminder name"]'), "field-specific failures focus the relevant control");
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("aria-invalid"), "true");
  } finally {
    await mounted.close();
  }
});

test("revision conflicts reload canonical progress without discarding the editable draft", async () => {
  let snapshotReads = 0;
  let updateAttempts = 0;
  const current = structuredClone(fixtureSnapshot);
  current.pulses[0].definitionRevision = 1;
  const latest = structuredClone(current);
  latest.pulses[0].definitionRevision = 2;
  latest.seriesProgress = { "water-plants": { generated: 2, remaining: 28, complete: false } };
  const mounted = await mountedPulse(current, undefined, async (entry) => {
    if (entry.method === "GET" && entry.path === "/api/v1/snapshot") {
      snapshotReads += 1;
      return { status: 200, body: snapshotReads === 1 ? current : latest };
    }
    if (entry.method === "PATCH") {
      updateAttempts += 1;
      return updateAttempts === 1
        ? { status: 409, body: { error: "Definition revision conflict. Current revision is 2." } }
        : { status: 200, body: { pulse: entry.body } };
    }
    return { status: 200, body: {} };
  });
  try {
    await mounted.render("reminders");
    const card = [...mounted.dom.window.document.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await mounted.act(async () => { [...card.querySelectorAll("button")].find((button) => button.textContent === "Edit").click(); });
    const name = mounted.dom.window.document.querySelector('[aria-label="Reminder name"]');
    await mounted.act(async () => { setControlValue(name, "Water every plant"); });
    const form = mounted.dom.window.document.querySelector("form");
    await mounted.act(async () => { form.dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(snapshotReads, 2, "a conflict refreshes the canonical snapshot");
    assert.equal(name.value, "Water every plant", "the local draft survives the canonical refresh");
    assert.match(mounted.dom.window.document.body.textContent, /latest saved progress; your draft is still here/i);
    await mounted.act(async () => { form.dispatchEvent(new mounted.dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const updates = mounted.requests.filter((entry) => entry.method === "PATCH");
    assert.equal(updates.length, 2);
    assert.equal(updates[1].body.definitionRevision, 2, "retry uses the refreshed canonical revision");
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
    assert.ok(mounted.dom.window.document.querySelector(".pulse-ui__empty-mark svg"), "the empty state uses a meaningful vector reminder icon");
    assert.match(mounted.dom.window.document.body.textContent, /Status unavailable/);
    await mounted.render("settings");
    assert.match(mounted.dom.window.document.body.textContent, /Runner status unavailable/);
    assert.match(mounted.dom.window.document.body.textContent, /has not received a current health report/);
  } finally {
    await mounted.close();
  }
});

test("runner health badges use semantic success and warning treatments", async () => {
  const online = await mountedPulse();
  try {
    await online.render("settings");
    const badge = [...online.dom.window.document.querySelectorAll(".pulse-ui__badge")].find((candidate) => candidate.textContent === "Online");
    assert.equal(badge.classList.contains("pulse-ui__badge--success"), true);
  } finally {
    await online.close();
  }

  const stale = await mountedPulse({ ...fixtureSnapshot, runnerHealth: { status: "stale", checkedAt: fixtureSnapshot.runnerHealth.checkedAt } });
  try {
    await stale.render("settings");
    const badge = [...stale.dom.window.document.querySelectorAll(".pulse-ui__badge")].find((candidate) => candidate.textContent === "Needs attention");
    assert.equal(badge.classList.contains("pulse-ui__badge--warning"), true);
  } finally {
    await stale.close();
  }
});

test("production Advanced connection explains the private boundary and submits the selected folder", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { WorkshopToolView } = await import("../plugin/dist/index.js");
  const selected = [];
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => { root.render(React.createElement(WorkshopToolView, { requestWorkspaceRoot: (value) => selected.push(value) })); });
    assert.match(dom.window.document.body.textContent, /Opening Pulse/);
    assert.doesNotMatch(dom.window.document.body.textContent, /Advanced private-folder connection/);
    await waitFor(
      act,
      () => /Advanced private-folder connection/.test(dom.window.document.body.textContent),
      "Advanced connection should appear only after native capability detection finishes",
    );
    const text = dom.window.document.body.textContent;
    assert.match(text, /Advanced private-folder connection/);
    assert.match(text, /normal guided setup does not require a folder path/);
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
    globalThis.CustomEvent = previous.customEvent;
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
    await waitFor(
      act,
      () => Boolean(dom.window.document.querySelector('[aria-label="Pulse private folder"]')),
      "Remembered manual connection should appear after native capability detection finishes",
    );
    assert.equal(dom.window.document.querySelector('[aria-label="Pulse private folder"]').value, "/remembered/private/pulse");
    assert.deepEqual(selected, ["/remembered/private/pulse"]);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
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
    globalThis.CustomEvent = previous.customEvent;
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

test("a representative inherited palette renders every color-sensitive production surface", async () => {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { WorkshopToolView } = await import("../plugin/dist/index.js");
  const hostTokens = {
    "--workshop-canvas": "#071116",
    "--workshop-surface": "#0d1d24",
    "--workshop-surface-raised": "#1e2d33",
    "--workshop-border": "#5f6a70",
    "--workshop-text": "#ffffff",
    "--workshop-text-muted": "#b7b7bd",
    "--workshop-accent": "#2bb7e8",
    "--workshop-accent-strong": "#60c8eb",
    "--workshop-accent-warm": "#62e6bd",
    "--workshop-focus-ring": "#62e6bd",
    "--workshop-success": "#56d68b",
    "--workshop-warning": "#ffd34d",
    "--workshop-danger": "#ff5a79",
  };
  for (const [name, value] of Object.entries(hostTokens)) dom.window.document.documentElement.style.setProperty(name, value);
  dom.window.__TAURI_INTERNALS__ = {
    invoke: async (command) => {
      if (command === "read_secure_service_metadata") return { endpoint: "https://pulse.example" };
      if (command === "request_configured_secure_service") return { status: 200, body: fixtureSnapshot };
      throw new Error(`Unexpected host command: ${command}`);
    },
  };
  const root = createRoot(dom.window.document.getElementById("app"));
  try {
    await act(async () => {
      root.render(React.createElement(WorkshopToolView, {
        activeRouteId: "reminders",
        workspaceRoot: "/private/pulse",
        requestWorkspaceRoot: () => {},
      }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

    const pulseRoot = dom.window.document.querySelector(".pulse-ui");
    const style = pulseRoot.querySelector("style").textContent;
    assert.match(style, /--pulse-accent: var\(--workshop-accent, #ff2f92\)/);
    assert.ok(pulseRoot.querySelector(".pulse-ui__tab[aria-current='page']"));
    assert.ok(pulseRoot.querySelector(".pulse-ui__button--primary"));
    assert.ok(pulseRoot.querySelector(".pulse-ui__status-dot"));

    await act(async () => {
      [...pulseRoot.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click();
    });
    assert.ok(pulseRoot.querySelector(".pulse-ui__field input"));
    assert.ok(pulseRoot.querySelector(".pulse-ui__preset[aria-pressed='true']"));
    await act(async () => {
      [...pulseRoot.querySelectorAll("button")].find((button) => button.textContent === "Cancel").click();
    });

    const reminder = [...pulseRoot.querySelectorAll("article")].find((article) => article.textContent.includes("Water houseplants"));
    await act(async () => { [...reminder.querySelectorAll("button")].find((button) => button.textContent === "Edit").click(); });
    await act(async () => { pulseRoot.querySelector("[data-action='delete-reminder']").click(); });
    assert.ok(pulseRoot.querySelector(".pulse-ui__modal[role='dialog']"));
    assert.ok(pulseRoot.querySelector(".pulse-ui__modal .pulse-ui__button--danger"));
    await act(async () => {
      [...pulseRoot.querySelectorAll("button")].find((button) => button.textContent === "Keep reminder").click();
    });

    await act(async () => { [...pulseRoot.querySelectorAll("button")].find((button) => button.textContent === "History").click(); });
    assert.ok(pulseRoot.querySelector(".pulse-ui__history-icon"));
    await act(async () => { [...pulseRoot.querySelectorAll("button")].find((button) => button.textContent === "Settings").click(); });
    assert.ok(pulseRoot.querySelector(".pulse-ui__setting"));

    const sameRoot = pulseRoot;
    dom.window.document.documentElement.style.setProperty("--workshop-accent", "#ca78f2");
    assert.equal(dom.window.document.querySelector(".pulse-ui"), sameRoot, "palette changes do not remount or reconfigure Pulse");
    assert.equal(dom.window.document.documentElement.style.getPropertyValue("--workshop-accent"), "#ca78f2");
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
