import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><html lang='en'><head><title>Pulse date picker test</title></head><body><main><div id=app></div></main></body></html>", {
    pretendToBeVisual: true,
    url: "http://pulse.test",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    customEvent: globalThis.CustomEvent,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return { dom, previous };
}

async function mountPicker(props = {}) {
  const { dom, previous } = installDom();
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseDatePicker } = await import("../plugin/dist/date-picker.js");
  const changes = [];
  const root = createRoot(dom.window.document.getElementById("app"));
  const initialValue = props.value ?? "2026-09-14";
  const pickerProps = { ...props };
  delete pickerProps.value;
  delete pickerProps.onChange;
  function Harness() {
    const [value, setValue] = React.useState(initialValue);
    return React.createElement(PulseDatePicker, {
      label: "Date",
      ariaLabel: "Reminder date",
      dataField: "date",
      ...pickerProps,
      value,
      onChange: (next) => {
        changes.push(next);
        setValue(next);
      },
    });
  }
  await act(async () => {
    root.render(React.createElement(Harness));
  });
  return {
    act,
    changes,
    dom,
    close: async () => {
      await act(async () => root.unmount());
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.CustomEvent = previous.customEvent;
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    },
  };
}

function setSelectValue(select, value) {
  Object.getOwnPropertyDescriptor(select.ownerDocument.defaultView.HTMLSelectElement.prototype, "value").set.call(select, value);
  select.dispatchEvent(new select.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

test("the whole date field opens a readable calendar and commits a selected day", async () => {
  const mounted = await mountPicker();
  try {
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    assert.equal(trigger.tagName, "BUTTON");
    assert.match(trigger.textContent, /Mon, Sep 14, 2026/);
    assert.equal(trigger.getAttribute("aria-haspopup"), "dialog");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");

    await mounted.act(async () => trigger.click());
    const dialog = mounted.dom.window.document.querySelector("[role='dialog'][aria-label='Choose reminder date']");
    assert.ok(dialog);
    assert.equal(dialog.querySelector("[aria-label='Calendar month']").value, "9");
    assert.equal(dialog.querySelector("[aria-label='Calendar year']").value, "2026");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(dialog.querySelector("[data-date='2026-09-14']").getAttribute("aria-pressed"), "true");

    const chosen = dialog.querySelector("[data-date='2026-09-22']");
    await mounted.act(async () => chosen.click());
    assert.deepEqual(mounted.changes, ["2026-09-22"]);
    assert.equal(mounted.dom.window.document.querySelector("[role='dialog']"), null);
    assert.equal(mounted.dom.window.document.activeElement, trigger);
    assert.match(trigger.textContent, /Tue, Sep 22, 2026/);
  } finally {
    await mounted.close();
  }
});

test("calendar keyboard navigation crosses months, commits with Enter, and cancels with Escape", async () => {
  const mounted = await mountPicker();
  try {
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    await mounted.act(async () => trigger.click());
    const selected = mounted.dom.window.document.querySelector("[data-date='2026-09-14']");
    assert.equal(mounted.dom.window.document.activeElement, selected);

    await mounted.act(async () => {
      selected.dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve));
    });
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-09-15");
    await mounted.act(async () => {
      mounted.dom.window.document.activeElement.dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    });
    await mounted.act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    assert.equal(mounted.dom.window.document.querySelector("[aria-label='Calendar month']").value, "10");
    assert.equal(mounted.dom.window.document.querySelector("[aria-label='Calendar year']").value, "2026");
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-10-15");
    await mounted.act(async () => mounted.dom.window.document.activeElement.dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.deepEqual(mounted.changes, ["2026-10-15"]);

    await mounted.act(async () => trigger.click());
    await mounted.act(async () => mounted.dom.window.document.querySelector("[role='dialog']").dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(mounted.dom.window.document.querySelector("[role='dialog']"), null);
    assert.equal(mounted.dom.window.document.activeElement, trigger);
  } finally {
    await mounted.close();
  }
});

test("calendar navigation exposes bounded month controls, a Today shortcut, and disabled out-of-range dates", async () => {
  const mounted = await mountPicker({ min: "2026-09-14", max: "2026-10-20", today: "2026-09-18" });
  try {
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    await mounted.act(async () => trigger.click());
    assert.equal(mounted.dom.window.document.querySelector("[data-date='2026-09-13']").disabled, true);
    assert.equal(mounted.dom.window.document.querySelector("[data-date='2026-09-18']").getAttribute("data-today"), "true");
    assert.equal(mounted.dom.window.document.querySelector("[aria-label='Previous month']").disabled, true);

    const nextMonth = mounted.dom.window.document.querySelector("[aria-label='Next month']");
    await mounted.act(async () => nextMonth.click());
    assert.equal(mounted.dom.window.document.querySelector("[aria-label='Calendar month']").value, "10");
    assert.equal(nextMonth.disabled, true);
    assert.equal(mounted.dom.window.document.querySelector("[data-date='2026-10-21']").disabled, true);
    await mounted.act(async () => mounted.dom.window.document.querySelector("[data-action='choose-today']").click());
    assert.deepEqual(mounted.changes, ["2026-09-18"]);
  } finally {
    await mounted.close();
  }
});

test("month and year controls jump directly to distant dates", async () => {
  const mounted = await mountPicker();
  try {
    await mounted.act(async () => mounted.dom.window.document.querySelector("[data-field='date']").click());
    const month = mounted.dom.window.document.querySelector("[aria-label='Calendar month']");
    const year = mounted.dom.window.document.querySelector("[aria-label='Calendar year']");
    assert.equal(month.value, "9");
    assert.equal(year.value, "2026");
    await mounted.act(async () => setSelectValue(year, "2028"));
    await mounted.act(async () => setSelectValue(month, "12"));
    assert.ok(mounted.dom.window.document.querySelector("[data-date='2028-12-14']"));
    await mounted.act(async () => mounted.dom.window.document.querySelector("[data-date='2028-12-14']").click());
    assert.deepEqual(mounted.changes, ["2028-12-14"]);
  } finally {
    await mounted.close();
  }
});

test("month and year menus keep their native keyboard controls", async () => {
  const mounted = await mountPicker();
  try {
    await mounted.act(async () => mounted.dom.window.document.querySelector("[data-field='date']").click());
    const month = mounted.dom.window.document.querySelector("[aria-label='Calendar month']");
    month.focus();
    const arrow = new mounted.dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    await mounted.act(async () => month.dispatchEvent(arrow));
    assert.equal(arrow.defaultPrevented, false);
    assert.equal(mounted.dom.window.document.activeElement, month);
  } finally {
    await mounted.close();
  }
});

test("the open date picker has no automated accessibility violations", async () => {
  const mounted = await mountPicker();
  try {
    await mounted.act(async () => mounted.dom.window.document.querySelector("[data-field='date']").click());
    const axe = (await import("axe-core")).default;
    const result = await axe.run(mounted.dom.window.document, {
      rules: {
        "color-contrast": { enabled: false },
        "aria-dialog-name": { enabled: true },
      },
    });
    assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), []);
  } finally {
    await mounted.close();
  }
});

test("secondary calendar keyboard paths remain predictable", async () => {
  const mounted = await mountPicker();
  try {
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    await mounted.act(async () => trigger.click());
    const key = async (value) => {
      await mounted.act(async () => mounted.dom.window.document.activeElement.dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: value, bubbles: true })));
      await mounted.act(async () => new Promise((resolve) => setTimeout(resolve, 2)));
    };
    await key("Home");
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-09-13");
    await key("End");
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-09-19");
    await key("ArrowUp");
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-09-12");
    await key("ArrowDown");
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-09-19");
    await key("ArrowLeft");
    await key("PageUp");
    assert.equal(mounted.dom.window.document.querySelector("[aria-label='Calendar month']").value, "8");
  } finally {
    await mounted.close();
  }
});

test("previous-month, Close, and outside-click paths remain predictable", async () => {
  const mounted = await mountPicker();
  try {
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    await mounted.act(async () => trigger.click());
    await mounted.act(async () => mounted.dom.window.document.querySelector("[aria-label='Previous month']").click());
    assert.equal(mounted.dom.window.document.querySelector("[aria-label='Calendar month']").value, "8");
    await mounted.act(async () => [...mounted.dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Close").click());
    assert.equal(mounted.dom.window.document.querySelector("[role='dialog']"), null);
    assert.equal(mounted.dom.window.document.activeElement, trigger);

    await mounted.act(async () => trigger.click());
    await mounted.act(async () => mounted.dom.window.document.body.dispatchEvent(new mounted.dom.window.MouseEvent("mousedown", { bubbles: true })));
    assert.equal(mounted.dom.window.document.querySelector("[role='dialog']"), null);
  } finally {
    await mounted.close();
  }
});

test("keyboard navigation cannot move behind the minimum date", async () => {
  const mounted = await mountPicker({ min: "2026-09-14" });
  try {
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    await mounted.act(async () => trigger.click());
    const selected = mounted.dom.window.document.activeElement;
    await mounted.act(async () => selected.dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(mounted.dom.window.document.activeElement.getAttribute("data-date"), "2026-09-14");
    await mounted.act(async () => selected.dispatchEvent(new mounted.dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true })));
    assert.deepEqual(mounted.changes, ["2026-09-14"]);
  } finally {
    await mounted.close();
  }
});

test("a changed minimum clamps a stale controlled value instead of displaying an invalid date", async () => {
  const mounted = await mountPicker({ value: "2026-09-10", min: "2026-09-14" });
  try {
    await mounted.act(async () => new Promise((resolve) => setTimeout(resolve, 2)));
    const trigger = mounted.dom.window.document.querySelector("[data-field='date']");
    assert.equal(trigger.dataset.value, "2026-09-14");
    assert.deepEqual(mounted.changes, ["2026-09-14"]);
  } finally {
    await mounted.close();
  }
});
