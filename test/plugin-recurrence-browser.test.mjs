import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { withHeadlessBrowser } from "../scripts/headless-browser.mjs";
import { pulseStyles } from "../plugin/dist/styles.js";

function setControlValue(control, value) {
  const prototype = control instanceof control.ownerDocument.defaultView.HTMLSelectElement
    ? control.ownerDocument.defaultView.HTMLSelectElement.prototype
    : control.ownerDocument.defaultView.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, value);
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("input", { bubbles: true }));
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

test("the real recurrence editor remains readable at desktop and 200% zoom under an inherited palette", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", { pretendToBeVisual: true, url: "http://pulse.test" });
  const previous = { window: globalThis.window, document: globalThis.document, customEvent: globalThis.CustomEvent, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { PulseManagementView } = await import("../plugin/dist/index.js");
  const root = createRoot(dom.window.document.querySelector("#app"));
  try {
    await act(async () => {
      root.render(React.createElement("div", { className: "pulse-ui" }, React.createElement(PulseManagementView, {
        request: async () => ({ status: 200, body: { pulses: [], state: { version: 2, occurrences: [], events: [] }, seriesProgress: {}, recurrenceMigration: { required: false, legacyPulseIds: [] }, runnerHealth: { status: "running", checkedAt: new Date().toISOString() } } }),
      })));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    await act(async () => { [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent.includes("New reminder")).click(); });
    const repeatControl = [...dom.window.document.querySelectorAll('input[type="checkbox"]')]
      .find((input) => input.closest("label")?.textContent.includes("Repeat this reminder"));
    assert.equal(repeatControl.checked, false, "the rendered default is visibly one-time");
    assert.equal(dom.window.document.querySelector("#pulse-recurrence-panel"), null, "recurrence stays progressively disclosed");
    await act(async () => { dom.window.document.querySelector("[data-field='date']").click(); });
    const calendarMarkup = dom.window.document.querySelector("#app").innerHTML;
    await act(async () => { [...dom.window.document.querySelectorAll("button")].find((button) => button.textContent === "Close").click(); });
    const oneTimeMarkup = dom.window.document.querySelector("#app").innerHTML;
    await act(async () => {
      setControlValue(dom.window.document.querySelector('[aria-label="Reminder name"]'), "Replace air filter");
      repeatControl.click();
      setControlValue(dom.window.document.querySelector('[aria-label="Repeat frequency"]'), "monthly");
      [...dom.window.document.querySelectorAll('input[name="monthly-rule"]')].at(-1).click();
      setControlValue(dom.window.document.querySelector('[aria-label="Number of reminders"]'), "12");
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    assert.equal(dom.window.document.querySelectorAll(".pulse-ui__preview-dates time").length, 3);

    for (const control of dom.window.document.querySelectorAll("input, option")) {
      if ("checked" in control) control.toggleAttribute("checked", control.checked);
      if (control instanceof dom.window.HTMLOptionElement) control.toggleAttribute("selected", control.selected);
    }

    const retainedEvidence = process.env.PULSE_RECURRENCE_EVIDENCE_DIR;
    const temp = retainedEvidence ?? mkdtempSync(join(tmpdir(), "pulse-recurrence-render-"));
    mkdirSync(temp, { recursive: true });
    const file = join(temp, "recurrence.html");
    const screenshot = join(temp, "recurrence.png");
    const oneTimeFile = join(temp, "one-time.html");
    const oneTimeScreenshot = join(temp, "one-time.png");
    const calendarFile = join(temp, "date-picker.html");
    const calendarScreenshot = join(temp, "date-picker.png");
    const narrowScreenshot = join(temp, "recurrence-narrow.png");
    writeFileSync(oneTimeFile, `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}${pulseStyles}</style></head><body>${oneTimeMarkup}</body></html>`);
    writeFileSync(calendarFile, `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#071116;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.host{--workshop-canvas:#071116;--workshop-surface:#0d1d24;--workshop-surface-raised:#1e2d33;--workshop-border:#5f6a70;--workshop-text:#fff;--workshop-text-muted:#b7b7bd;--workshop-accent:#2bb7e8;--workshop-accent-strong:#60c8eb;--workshop-accent-warm:#62e6bd;--workshop-focus-ring:#62e6bd;--workshop-success:#56d68b;--workshop-warning:#ffd34d;--workshop-danger:#ff5a79}${pulseStyles}</style></head><body><main class="host">${calendarMarkup}</main></body></html>`);
    writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#071116;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.host{--workshop-canvas:#071116;--workshop-surface:#0d1d24;--workshop-surface-raised:#1e2d33;--workshop-border:#5f6a70;--workshop-text:#fff;--workshop-text-muted:#b7b7bd;--workshop-accent:#2bb7e8;--workshop-accent-strong:#60c8eb;--workshop-accent-warm:#62e6bd;--workshop-focus-ring:#62e6bd;--workshop-success:#56d68b;--workshop-warning:#ffd34d;--workshop-danger:#ff5a79}${pulseStyles}</style></head><body><main class="host">${dom.window.document.querySelector("#app").innerHTML}</main></body></html>`);
    try {
      await withHeadlessBrowser(async (browser) => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
        await page.goto(`file://${oneTimeFile}`, { waitUntil: "load" });
        const standalone = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
          repeatChecked: document.querySelector('input[type="checkbox"]')?.checked,
          recurrenceVisible: Boolean(document.querySelector("#pulse-recurrence-panel")),
          text: getComputedStyle(document.querySelector(".pulse-ui")).color,
          canvas: getComputedStyle(document.querySelector(".pulse-ui")).backgroundColor,
        }));
        assert.ok(standalone.documentWidth <= standalone.viewport, JSON.stringify(standalone));
        assert.equal(standalone.repeatChecked, false);
        assert.equal(standalone.recurrenceVisible, false);
        assert.notEqual(standalone.text, standalone.canvas);
        await page.screenshot({ path: oneTimeScreenshot, fullPage: true });

        await page.goto(`file://${calendarFile}`, { waitUntil: "load" });
        const calendar = await page.evaluate(() => {
          const picker = document.querySelector(".pulse-ui__calendar");
          const selected = document.querySelector(".pulse-ui__calendar-grid [aria-pressed='true']");
          const pickerStyle = getComputedStyle(picker);
          const selectedStyle = getComputedStyle(selected);
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewport: innerWidth,
            pickerWidth: picker?.getBoundingClientRect().width,
            expanded: document.querySelector(".pulse-ui__date-trigger")?.getAttribute("aria-expanded"),
            pickerText: pickerStyle.color,
            pickerSurface: pickerStyle.backgroundColor,
            selectedText: selectedStyle.color,
            selectedSurface: selectedStyle.backgroundColor,
          };
        });
        assert.ok(calendar.documentWidth <= calendar.viewport, JSON.stringify(calendar));
        assert.ok(calendar.pickerWidth >= 300, "calendar days have a comfortable desktop target area");
        assert.equal(calendar.expanded, "true");
        assert.notEqual(calendar.pickerText, calendar.pickerSurface);
        assert.notEqual(calendar.selectedText, calendar.selectedSurface);
        await page.screenshot({ path: calendarScreenshot, fullPage: true });

        await page.goto(`file://${file}`, { waitUntil: "load" });
        const desktop = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
          panelWidth: document.querySelector(".pulse-ui__recurrence")?.getBoundingClientRect().width,
          previewDates: document.querySelectorAll(".pulse-ui__preview-dates time").length,
          inputText: getComputedStyle(document.querySelector("input")).color,
          inputSurface: getComputedStyle(document.querySelector("input")).backgroundColor,
        }));
        assert.ok(desktop.documentWidth <= desktop.viewport, JSON.stringify(desktop));
        assert.ok(desktop.panelWidth > 600, "desktop recurrence controls use the available laptop width");
        assert.equal(desktop.previewDates, 3);
        assert.notEqual(desktop.inputText, desktop.inputSurface);
        await page.screenshot({ path: screenshot, fullPage: true });
        await page.evaluate(() => { document.body.style.zoom = "2"; });
        const zoomed = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(zoomed.documentWidth <= zoomed.viewport, `200% zoom must not create page overflow: ${JSON.stringify(zoomed)}`);
        await page.evaluate(() => { document.body.style.zoom = "1"; });
        await page.setViewportSize({ width: 720, height: 1000 });
        const narrow = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
          fieldWidth: document.querySelector(".pulse-ui__field")?.getBoundingClientRect().width,
          panelWidth: document.querySelector(".pulse-ui__recurrence")?.getBoundingClientRect().width,
        }));
        assert.ok(narrow.documentWidth <= narrow.viewport, `narrow layout must not create page overflow: ${JSON.stringify(narrow)}`);
        assert.ok(narrow.fieldWidth > 250 && narrow.panelWidth > 300, JSON.stringify(narrow));
        await page.screenshot({ path: narrowScreenshot, fullPage: true });
        await page.close();
      });
      assert.ok(statSync(screenshot).size > 10_000, "the recurrence editor produces inspectable visual evidence");
      assert.ok(statSync(oneTimeScreenshot).size > 10_000, "the one-time default produces inspectable standalone evidence");
      assert.ok(statSync(calendarScreenshot).size > 10_000, "the open date picker produces inspectable visual evidence");
      assert.ok(statSync(narrowScreenshot).size > 10_000, "the narrow recurrence editor produces inspectable evidence");
    } finally {
      if (!retainedEvidence) rmSync(temp, { recursive: true, force: true });
    }
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.CustomEvent = previous.customEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
