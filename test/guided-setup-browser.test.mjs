import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { withHeadlessBrowser } from "../scripts/headless-browser.mjs";

const html = readFileSync(new URL("../design/onboarding-prototype/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../design/onboarding-prototype/onboarding.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../design/onboarding-prototype/onboarding.js", import.meta.url), "utf8");
const axe = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

test("G1 real-browser layouts have no page overflow or automated accessibility violations", async () => {
  const temp = mkdtempSync(join(tmpdir(), "pulse-guided-setup-browser-"));
  try {
    writeFileSync(join(temp, "onboarding.css"), css);
    writeFileSync(join(temp, "onboarding.js"), script);
    writeFileSync(join(temp, "axe.min.js"), axe);
    writeFileSync(join(temp, "audit.js"), auditScript);
    const selectedRoutes = [
      "welcome",
      "phone",
      "phone-reserve",
      "phone-subscribe",
      "phone-token",
      "runner",
      "pairing",
      "existing",
      "delivery",
      "test",
      "test-sent",
      "complete",
      "state/advanced",
    ];
    const recoveryStates = [
      "resume",
      "phone-permission",
      "phone-account",
      "phone-subscription",
      "ntfy-verification",
      "private-topic",
      "adapter-unavailable",
      "provider-authorization",
      "team-permission",
      "invalid-url",
      "incompatible-runner",
      "fingerprint-mismatch",
      "proof-failed",
      "secure-storage-failed",
      "runner-starting",
      "test-rejected",
      "test-not-received",
      "existing-installation",
      "stale-setup",
      "migrated-setup",
      "advanced",
    ];
    const directionRoutes = ["journey", "board", "companion"].flatMap((direction) =>
      ["welcome", "phone", "runner", "pairing", "delivery", "test", "complete"].flatMap((step) => [
        [`${direction}/${step}`, 1440, 1400],
        [`${direction}/${step}`, 500, 1800],
      ]),
    );
    const comprehensiveRoutes = [
      ["compare", 1440, 1650],
      ["compare", 500, 3300],
      ...directionRoutes,
      ...selectedRoutes.flatMap((route) => [
        [`selected/${route}`, 1440, route.startsWith("phone-") ? 1500 : 1400],
        [`selected/${route}`, 500, route.startsWith("phone-") ? 2000 : 1800],
      ]),
      ...recoveryStates.flatMap((state) => [
        [`selected/state/${state}`, 1440, state === "advanced" ? 1450 : 1400],
        [`selected/state/${state}`, 500, state === "advanced" ? 1800 : 1800],
      ]),
      ...recoveryStates.flatMap((state) => [
        [`journey/state/${state}`, 1440, state === "advanced" ? 1450 : 1200],
        [`journey/state/${state}`, 500, state === "advanced" ? 1800 : 1200],
      ]),
    ];
    const file = join(temp, "index.html");
    writeFileSync(file, renderAuditFixture());
    const failures = [];
    await withHeadlessBrowser(async (browser) => {
      const page = await browser.newPage();
      try {
        for (const [route, width, height] of comprehensiveRoutes) {
          await page.setViewportSize({ width, height });
          await page.goto(`file://${file}?audit=${encodeURIComponent(`${route}-${width}`)}#/${route}`, { waitUntil: "load", timeout: 20_000 });
          await page.waitForFunction(
            () => document.querySelector("#setup-browser-result")?.textContent?.startsWith("{"),
            undefined,
            { timeout: 20_000 },
          );
          const evidence = await page.locator("#setup-browser-result").textContent();
          if (!evidence) {
            failures.push({ context: `${route} at ${width}px`, issue: "missing browser audit evidence" });
            continue;
          }
          const result = JSON.parse(evidence);
          const context = `${route} at ${width}px`;
          if (result.viewport !== width) failures.push({ context, issue: "wrong viewport", actual: result.viewport });
          if (result.documentWidth > result.viewport) {
            failures.push({ context, issue: "page overflow", documentWidth: result.documentWidth });
          }
          if (result.unexpectedOverflow.length > 0) {
            failures.push({ context, issue: "unexpected element overflow", details: result.unexpectedOverflow });
          }
          if (result.visualProblems.length > 0) {
            failures.push({ context, issue: "shared visual contract", details: result.visualProblems });
          }
          if (result.violations.length > 0) {
            failures.push({ context, issue: "axe accessibility", details: result.violations });
          }
        }
      } finally {
        await page.close();
      }
    });
    assert.deepEqual(failures, [], "all setup routes and viewports pass in one comprehensive browser audit");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

function renderAuditFixture() {
  return html.replace(
    '<script src="./onboarding.js"></script>',
    `<script src="./onboarding.js"></script>
<script src="./axe.min.js"></script>
<pre id="setup-browser-result"></pre>
<script src="./audit.js"></script>`,
  );
}

const auditScript = `
window.addEventListener("load", async () => {
  const allowedOverflow = new Set([
    "pulse-setup__direction-switcher",
    "pulse-setup__journey-rail",
    "pulse-setup__state-browser",
    "pulse-setup__companion-list",
  ]);
  const unexpectedOverflow = [...document.querySelectorAll("body *")]
    .filter((element) => element.scrollWidth > element.clientWidth + 1)
    .filter((element) => getComputedStyle(element).overflowX === "visible")
    .filter((element) => !element.matches(".pulse-setup__architecture > div"))
    .filter((element) => ![...element.classList].some((name) => allowedOverflow.has(name)))
    .map((element) => element.className || element.tagName)
    .filter((name, index, values) => values.indexOf(name) === index);
  const audit = await axe.run(document, {
    rules: {
      region: { enabled: false },
    },
  });
  const visualProblems = [];
  if (window.scrollX !== 0 || window.scrollY !== 0) visualProblems.push("unexpected-initial-scroll-position");
  for (const badge of document.querySelectorAll(".pulse-setup__badge")) {
    const style = getComputedStyle(badge);
    if (style.whiteSpace !== "nowrap" || badge.scrollWidth > badge.clientWidth + 1) {
      visualProblems.push("badge-wrap");
    }
    const heading = badge.nextElementSibling;
    if (heading?.matches(".pulse-setup__card-title, .pulse-setup__subheading")) {
      const gap = heading.getBoundingClientRect().top - badge.getBoundingClientRect().bottom;
      if (gap < 18) visualProblems.push("badge-heading-gap");
    }
  }
  for (const item of document.querySelectorAll(".pulse-setup__phone-instructions li")) {
    const marker = getComputedStyle(item, "::before");
    if (marker.borderRadius !== "50%") visualProblems.push("phone-number-shape");
  }
  for (const marker of document.querySelectorAll(".pulse-setup__fact-icon.is-number")) {
    if (getComputedStyle(marker).borderRadius !== "50%") visualProblems.push("fact-number-shape");
  }
  for (const icon of document.querySelectorAll(".pulse-setup__fact-icon:not(.is-number)")) {
    if (!icon.querySelector("svg")) visualProblems.push("non-vector-fact-icon");
  }
  for (const control of document.querySelectorAll("button, .pulse-setup__button")) {
    if (control.scrollWidth > control.clientWidth + 1) visualProblems.push("control-content-overflow");
  }
  for (const descendant of document.querySelectorAll(".pulse-setup__choice *")) {
    if (getComputedStyle(descendant).textDecorationLine !== "none") visualProblems.push("choice-descendant-underline");
  }
  const activeProgress = document.querySelector(".pulse-setup__companion-list [aria-current='step']");
  const progressList = activeProgress?.closest(".pulse-setup__companion-list");
  if (activeProgress && progressList) {
    const activeRect = activeProgress.getBoundingClientRect();
    const listRect = progressList.getBoundingClientRect();
    if (activeRect.left < listRect.left - 1 || activeRect.right > listRect.right + 1) {
      visualProblems.push("active-progress-clipped");
    }
    if (progressList.scrollWidth > progressList.clientWidth + 1 || progressList.scrollLeft !== 0) {
      visualProblems.push("progress-navigation-requires-horizontal-scroll");
    }
  }
  for (const progressList of document.querySelectorAll(".pulse-setup__step-list")) {
    if (progressList.scrollWidth > progressList.clientWidth + 1) {
      visualProblems.push("recovery-progress-requires-horizontal-scroll");
    }
  }
  document.querySelector("#setup-browser-result").textContent = JSON.stringify({
    route: window.location.hash,
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    unexpectedOverflow,
    visualProblems: [...new Set(visualProblems)],
    violations: audit.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  });
});
`;
