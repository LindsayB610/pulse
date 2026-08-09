import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const htmlUrl = new URL("../design/prototype/index.html", import.meta.url);
const scriptUrl = new URL("../design/prototype/prototype.js", import.meta.url);
const axeUrl = new URL("../node_modules/axe-core/axe.min.js", import.meta.url);

async function prototype() {
  const [html, script, axe] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
    readFile(axeUrl, "utf8"),
  ]);
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "http://pulse.test/#/compare",
  });
  dom.window.scrollTo = () => {};
  dom.window.eval(axe);
  dom.window.eval(script);
  return dom;
}

function navigate(dom, route) {
  dom.window.location.hash = `#/${route}`;
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
}

async function assertAccessible(dom, state) {
  const result = await dom.window.axe.run(dom.window.document, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  assert.deepEqual(
    Array.from(result.violations, (violation) => ({
      id: violation.id,
      targets: Array.from(violation.nodes, (node) => Array.from(node.target)),
    })),
    [],
    `${state} must have no automated accessibility violations`,
  );
}

test("D0 prototype routes expose readable, accessible product states", async () => {
  const dom = await prototype();
  try {
    for (const [route, heading] of [
      ["compare", "Three directions. One Pulse."],
      ["reminders", "Reminders"],
      ["empty", "No reminders yet"],
      ["new", "Create a reminder"],
      ["edit/water-plants", "Edit reminder"],
      ["history", "History"],
      ["history-empty", "No completed reminders yet"],
      ["settings", "Settings"],
      ["setup", "Connect your reminders"],
    ]) {
      navigate(dom, route);
      assert.ok([...dom.window.document.querySelectorAll("h1, h2")].some((element) => element.textContent.includes(heading)), `${route} renders ${heading}`);
      assert.equal(dom.window.document.documentElement.scrollWidth <= dom.window.document.documentElement.clientWidth || dom.window.document.documentElement.clientWidth === 0, true);
      await assertAccessible(dom, route);
    }
  } finally {
    dom.window.close();
  }
});

test("D0 prototype completes management workflows and preserves phone-only actions", async () => {
  const dom = await prototype();
  const document = dom.window.document;
  try {
    navigate(dom, "new");
    const title = document.querySelector("[name='title']");
    title.value = "Feed the sourdough starter";
    title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(document.querySelector("#preview-title").textContent, "Feed the sourdough starter");
    const day = document.querySelector("[name='day']");
    const time = document.querySelector("[name='time']");
    day.value = "Wednesday";
    day.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    time.value = "18:45";
    time.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(document.querySelector("#preview-schedule").textContent, "Due Wednesday at 6:45 PM PT");

    const customRepeat = document.querySelector("input[name='repeat'][value='custom']");
    customRepeat.click();
    assert.equal(document.querySelector("[data-custom-for='repeat']").classList.contains("is-visible"), true);
    document.querySelector("#reminder-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(dom.window.location.hash, "#/reminders");

    navigate(dom, "edit/water-plants");
    const deleteButton = document.querySelector("#delete-reminder");
    deleteButton.focus();
    deleteButton.click();
    assert.equal(document.querySelector("[role='dialog']")?.getAttribute("aria-modal"), "true");
    assert.equal(document.activeElement.id, "cancel-delete");
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(document.querySelector("[role='dialog']"), null);
    assert.equal(document.activeElement.id, "delete-reminder");

    navigate(dom, "reminders");
    assert.equal([...document.querySelectorAll("button")].some((button) => /done|snooze/i.test(button.textContent)), false);
    assert.match(document.body.textContent, /Edit/);
    assert.match(document.body.textContent, /Pause/);
  } finally {
    dom.window.close();
  }
});
