import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

function setControlValue(control, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    control instanceof control.ownerDocument.defaultView.HTMLSelectElement
      ? control.ownerDocument.defaultView.HTMLSelectElement.prototype
      : control.ownerDocument.defaultView.HTMLInputElement.prototype,
    "value",
  );
  descriptor.set.call(control, value);
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("input", { bubbles: true }));
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

test("mounted Pulse management view creates, refreshes, and renders a configurable reminder", async () => {
  const dom = new JSDOM("<!doctype html><div id=app></div>", { url: "http://pulse.test" });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseManagementView } = await import("../plugin/dist/index.js");
  const requests = [];
  let created;
  const request = async (entry) => {
    requests.push(entry);
    if (entry.method === "GET") return { status: 200, body: { pulses: created ? [created] : [], state: {} } };
    if (entry.method === "POST") { created = entry.body; return { status: 201, body: { pulse: created } }; }
    return { status: 200, body: {} };
  };
  const root = createRoot(dom.window.document.getElementById("app"));

  try {
    await act(async () => { root.render(React.createElement(PulseManagementView, { request })); });
    await act(async () => {
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder name"]'), "Water plants");
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder day"]'), "wednesday");
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder time"]'), "18:45");
      setControlValue(dom.window.document.querySelector('[aria-label="Repeat notification minutes"]'), "45");
      setControlValue(dom.window.document.querySelector('[aria-label="Unanswered snooze minutes"]'), "1440");
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder time zone"]'), "America/New_York");
    });
    await act(async () => { dom.window.document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });

    assert.deepEqual(requests.find((entry) => entry.method === "POST"), {
      method: "POST",
      path: "/api/v1/pulses",
      body: { id: "water-plants", title: "Water plants", active: true, schedule: { type: "weekly", daysOfWeek: ["wednesday"], time: "18:45", timezone: "America/New_York" }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 45, snoozeEveryMinutes: 1440 } },
    });
    assert.match(dom.window.document.body.textContent, /Water plants.*wednesday at 18:45.*America\/New_York/i);
    assert.match(dom.window.document.querySelector('[role="status"]').textContent, /Reminder saved/);
    assert.doesNotMatch(dom.window.document.body.textContent, /token|authorization|dismiss/i);
    assert.equal([...dom.window.document.querySelectorAll("button")].some((button) => /snooze|dismiss/i.test(button.textContent)), false);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
