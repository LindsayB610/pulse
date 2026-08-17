import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const chromeCandidates = [
  process.env.PULSE_TEST_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
const html = readFileSync(new URL("../design/onboarding-prototype/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../design/onboarding-prototype/onboarding.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../design/onboarding-prototype/onboarding.js", import.meta.url), "utf8");

test("G1 real browser completes the happy path, validation, retry, modal, and narrow interactions", () => {
  assert.ok(chrome, "Chrome or Chromium is required for setup interaction proof; set PULSE_TEST_CHROME");
  const temp = mkdtempSync(join(tmpdir(), "pulse-guided-setup-interactions-"));
  try {
    writeFileSync(join(temp, "onboarding.css"), css);
    writeFileSync(join(temp, "onboarding.js"), script);
    writeFileSync(join(temp, "interaction.js"), interactionScript);
    writeFileSync(
      join(temp, "index.html"),
      html.replace(
        '<script src="./onboarding.js"></script>',
        '<script src="./onboarding.js"></script><pre id="setup-browser-interactions"></pre><script src="./interaction.js"></script>',
      ),
    );

    for (const width of [1440, 500]) {
      const output = execFileSync(
        chrome,
        [
          "--headless",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--no-first-run",
          "--hide-scrollbars",
          "--virtual-time-budget=5000",
          `--window-size=${width},1800`,
          "--dump-dom",
          `file://${join(temp, "index.html")}#/selected/welcome`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000 },
      );
      const match = output.match(/<pre id="setup-browser-interactions">([^<]+)<\/pre>/);
      assert.ok(match, `${width}px browser run returned interaction evidence`);
      const result = JSON.parse(match[1].replaceAll("&amp;", "&"));
      assert.deepEqual(result.failures, [], `${width}px real-browser interactions remain truthful`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

const interactionScript = `
window.addEventListener("load", async () => {
  const failures = [];
  const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
  const go = async (route) => {
    window.location.hash = "#/" + route;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await delay();
  };
  const submit = (form) => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  localStorage.clear();

  await go("selected/welcome");
  document.querySelector("[data-primary-start]").click();
  await delay();
  window.scrollTo(0, document.body.scrollHeight);
  document.querySelector('a[href="#/selected/phone-reserve"]').click();
  await delay();
  if (window.scrollY !== 0 || document.querySelector("h1").getBoundingClientRect().top < 0) {
    failures.push("route-change-preserved-old-scroll-position");
  }
  for (const target of ["phone-subscribe", "phone-token", "runner", "pairing"]) {
    document.querySelector('a[href="#/selected/' + target + '"]').click();
    await delay();
  }
  const happyInput = document.querySelector("#runner-address");
  happyInput.value = "https://pulse-happy-path.example";
  happyInput.dispatchEvent(new Event("input", { bubbles: true }));
  submit(document.querySelector("[data-runner-form]"));
  await delay(350);
  document.querySelector('a[href="#/selected/test"]').click();
  await delay();
  document.querySelector("[data-send-test]").click();
  if (location.hash !== "#/selected/test" || !document.querySelector("[data-send-test]").disabled) {
    failures.push("initial-test-did-not-wait-for-acceptance");
  }
  await delay(350);
  document.querySelector('a[href="#/selected/complete"]').click();
  await delay();
  if (location.hash !== "#/selected/complete" || !document.body.textContent.includes("Pulse is ready")) {
    failures.push("happy-path-did-not-complete");
  }
  await go("selected/state/resume");
  document.querySelector("[data-open-restart]").click();
  document.querySelector("[data-confirm-restart]").click();
  await delay();

  document.querySelector("[data-primary-start]").click();
  await delay();
  document.querySelector("[data-skip-setup]").click();
  if (location.hash !== "#/selected/phone" || document.activeElement.id !== "setup-root") {
    failures.push("skip-link-escaped-selected-flow");
  }

  for (const target of ["phone-reserve", "phone-subscribe", "phone-token", "runner", "pairing"]) {
    document.querySelector('a[href="#/selected/' + target + '"]').click();
    await delay();
  }
  let input = document.querySelector("#runner-address");
  input.value = "http://localhost:8888/api?token=oops#fragment";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  submit(document.querySelector("[data-runner-form]"));
  if (location.hash !== "#/selected/pairing" || input.getAttribute("aria-invalid") !== "true") {
    failures.push("unsafe-runner-origin-accepted");
  }
  input.value = "https://pulse-browser-proof.example";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  submit(document.querySelector("[data-runner-form]"));
  if (!document.querySelector("[data-runner-submit]").disabled) failures.push("runner-submit-not-locked");
  await delay(350);
  if (location.hash !== "#/selected/delivery" || !document.body.textContent.includes("pulse-browser-proof")) {
    failures.push("validated-runner-identity-not-derived");
  }

  document.querySelector('a[href="#/selected/test"]').click();
  await delay();
  await go("selected/state/test-not-received");
  if (document.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow") !== "6") {
    failures.push("recovery-progress-regressed");
  }
  const recoveryProgress = document.querySelector(".pulse-setup__step-list");
  if (recoveryProgress && recoveryProgress.scrollWidth > recoveryProgress.clientWidth + 1) {
    failures.push("recovery-progress-requires-horizontal-scroll");
  }
  document.querySelector("[data-resend-test]").click();
  await delay(350);
  if (location.hash !== "#/selected/test-sent" || !document.body.textContent.includes("Resent just now")) {
    failures.push("test-resend-did-not-resend");
  }
  await go("selected/state/test-not-received");
  if (!document.querySelector("[data-resend-test]")?.disabled) {
    failures.push("test-resend-cooldown-not-enforced");
  }

  await go("selected/state/resume");
  document.querySelector("[data-open-restart]").click();
  const cancel = document.querySelector("[data-cancel-restart]");
  const confirm = document.querySelector("[data-confirm-restart]");
  cancel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
  if (document.activeElement !== confirm) failures.push("modal-shift-tab-escaped");
  confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  if (document.activeElement !== cancel) failures.push("modal-tab-escaped");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  await go("selected/pairing");
  const active = document.querySelector(".pulse-setup__companion-list [aria-current='step']");
  const list = active?.closest(".pulse-setup__companion-list");
  if (active && list) {
    const activeRect = active.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (activeRect.left < listRect.left - 1 || activeRect.right > listRect.right + 1) {
      failures.push("active-progress-clipped");
    }
    if (list.scrollWidth > list.clientWidth + 1 || list.scrollLeft !== 0) {
      failures.push("progress-navigation-requires-horizontal-scroll");
    }
  }

  document.querySelector("#setup-browser-interactions").textContent = JSON.stringify({ failures });
});
`;
