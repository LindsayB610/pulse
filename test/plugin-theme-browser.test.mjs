import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pulseStyles } from "../plugin/dist/styles.js";

const chromeCandidates = [
  process.env.PULSE_TEST_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => existsSync(candidate));

test("a real browser resolves standalone fallbacks and a live inherited palette", () => {
  assert.ok(chrome, "Chrome or Chromium is required for the Pulse visual contract test; set PULSE_TEST_CHROME when it is installed elsewhere");
  const evidenceDirectory = process.env.PULSE_THEME_EVIDENCE_DIR;
  const temp = evidenceDirectory || mkdtempSync(join(tmpdir(), "pulse-theme-render-"));
  if (evidenceDirectory) mkdirSync(temp, { recursive: true });
  try {
    const htmlPath = join(temp, "theme.html");
    const screenshotPath = join(temp, "theme.png");
    writeFileSync(htmlPath, renderFixture());

    const output = execFileSync(chrome, [
      "--headless",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--no-first-run",
      "--virtual-time-budget=1000",
      "--window-size=1200,900",
      "--dump-dom",
      `file://${htmlPath}`,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
    const match = output.match(/<pre id="pulse-theme-result">([^<]+)<\/pre>/);
    assert.ok(match, "browser render must publish resolved style evidence");
    const result = JSON.parse(match[1].replaceAll("&amp;", "&"));

    assert.deepEqual(result.standalone, {
      canvas: "rgb(0, 0, 0)",
      text: "rgb(247, 247, 248)",
      selectedText: "rgb(255, 255, 255)",
      inputText: "rgb(255, 255, 255)",
      selectedPresetText: "rgb(255, 255, 255)",
      tabHoverSurface: "rgba(255, 255, 255, 0.06)",
      statusHalo: "color(srgb 0.368627 0.894118 0.607843 / 0.11) 0px 0px 0px 4px",
      selectedPresetBorder: "color(srgb 1 0.184314 0.572549 / 0.45)",
      hostHoverHighlight: "rgba(0, 0, 0, 0)",
    });
    assert.deepEqual(result.inherited, {
      canvas: "rgb(7, 17, 22)",
      panel: "rgb(13, 29, 36)",
      control: "rgb(30, 45, 51)",
      text: "rgb(255, 255, 255)",
      muted: "rgb(183, 183, 189)",
      selectedText: "rgb(255, 255, 255)",
      inputText: "rgb(255, 255, 255)",
      inputSurface: "rgb(30, 45, 51)",
      modalText: "rgb(255, 255, 255)",
      modalSurface: "rgb(30, 45, 51)",
      alert: "rgb(255, 90, 121)",
      history: "rgb(86, 214, 139)",
      panelBorder: "rgb(95, 106, 112)",
      accentBefore: "rgb(43, 183, 232)",
      accentAfter: "rgb(202, 120, 242)",
      primary: "rgb(98, 230, 189)",
      danger: "rgb(255, 90, 121)",
      warning: "rgb(255, 211, 77)",
      success: "rgb(86, 214, 139)",
      focusRing: "rgb(98, 230, 189)",
      hostHoverHighlight: "rgb(255, 255, 255)",
    });

    execFileSync(chrome, [
      "--headless",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--no-first-run",
      "--window-size=1200,900",
      `--screenshot=${screenshotPath}`,
      `file://${htmlPath}`,
    ], { stdio: "pipe", timeout: 15_000 });
    assert.ok(statSync(screenshotPath).size > 10_000, "visual contract must produce a real browser screenshot");
  } finally {
    if (!evidenceDirectory) rmSync(temp, { recursive: true, force: true });
  }
});

function renderFixture() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
body { margin: 0; background: #232328; font-family: system-ui; }
.fixture { padding: 24px; }
.fixture + .fixture { margin-top: 20px; }
.inherited {
  --workshop-canvas: #071116;
  --workshop-surface: #0d1d24;
  --workshop-surface-raised: #1e2d33;
  --workshop-border: #5f6a70;
  --workshop-text: #ffffff;
  --workshop-text-muted: #b7b7bd;
  --workshop-accent: #2bb7e8;
  --workshop-accent-strong: #60c8eb;
  --workshop-accent-warm: #62e6bd;
  --workshop-focus-ring: #62e6bd;
  --workshop-success: #56d68b;
  --workshop-warning: #ffd34d;
  --workshop-danger: #ff5a79;
}
${pulseStyles}
.pulse-ui .pulse-theme-probe-tab { background: var(--pulse-tab-hover-surface); }
.pulse-ui .pulse-theme-probe-focus { color: var(--pulse-focus-ring); }
.pulse-ui .pulse-theme-probe-hover { color: var(--pulse-host-hover-highlight); }
</style></head><body>
${surface("standalone")}
${surface("inherited")}
<pre id="pulse-theme-result"></pre>
<script>
const read = (root) => {
  const style = (selector) => getComputedStyle(root.querySelector(selector));
  return {
    canvas: getComputedStyle(root).backgroundColor,
    panel: style(".pulse-ui__panel").backgroundColor,
    control: style(".pulse-ui__button").backgroundColor,
    panelBorder: style(".pulse-ui__panel").borderTopColor,
    text: getComputedStyle(root).color,
    muted: style(".pulse-ui__muted").color,
    accent: style(".pulse-ui__eyebrow").color,
    primary: style(".pulse-ui__button--primary").backgroundColor,
    danger: style(".pulse-ui__button--danger").color,
    warning: style(".pulse-ui__badge--due").color,
    success: style(".pulse-ui__status-dot").backgroundColor,
    focusRing: style(".pulse-theme-probe-focus").color,
    selectedText: style(".pulse-ui__tab[aria-current='page']").color,
    inputText: style("input").color,
    inputSurface: style("input").backgroundColor,
    modalText: style(".pulse-ui__modal").color,
    modalSurface: style(".pulse-ui__modal").backgroundColor,
    alert: style(".pulse-ui__notice[role='alert']").color,
    history: style(".pulse-ui__history-icon").color,
    selectedPresetText: style(".pulse-ui__preset").color,
    tabHoverSurface: style(".pulse-theme-probe-tab").backgroundColor,
    statusHalo: style(".pulse-ui__status-dot").boxShadow,
    selectedPresetBorder: style(".pulse-ui__preset").borderTopColor,
    hostHoverHighlight: style(".pulse-theme-probe-hover").color,
  };
};
const standaloneRoot = document.querySelector(".standalone .pulse-ui");
const inheritedFixture = document.querySelector(".inherited");
const inheritedRoot = inheritedFixture.querySelector(".pulse-ui");
const standalone = read(standaloneRoot);
const inheritedBefore = read(inheritedRoot);
inheritedFixture.style.setProperty("--workshop-accent", "#ca78f2");
const inheritedAfter = read(inheritedRoot);
document.querySelector("#pulse-theme-result").textContent = JSON.stringify({
  standalone: {
    canvas: standalone.canvas,
    text: standalone.text,
    selectedText: standalone.selectedText,
    inputText: standalone.inputText,
    selectedPresetText: standalone.selectedPresetText,
    tabHoverSurface: standalone.tabHoverSurface,
    statusHalo: standalone.statusHalo,
    selectedPresetBorder: standalone.selectedPresetBorder,
    hostHoverHighlight: standalone.hostHoverHighlight,
  },
  inherited: {
    canvas: inheritedBefore.canvas,
    panel: inheritedBefore.panel,
    control: inheritedBefore.control,
    text: inheritedBefore.text,
    muted: inheritedBefore.muted,
    selectedText: inheritedBefore.selectedText,
    inputText: inheritedBefore.inputText,
    inputSurface: inheritedBefore.inputSurface,
    modalText: inheritedBefore.modalText,
    modalSurface: inheritedBefore.modalSurface,
    alert: inheritedBefore.alert,
    history: inheritedBefore.history,
    panelBorder: inheritedBefore.panelBorder,
    accentBefore: inheritedBefore.accent,
    accentAfter: inheritedAfter.accent,
    primary: inheritedBefore.primary,
    danger: inheritedBefore.danger,
    warning: inheritedBefore.warning,
    success: inheritedBefore.success,
    focusRing: inheritedBefore.focusRing,
    hostHoverHighlight: inheritedBefore.hostHoverHighlight,
  },
});
</script></body></html>`;
}

function surface(kind) {
  return `<section class="fixture ${kind}"><main class="pulse-ui">
    <nav class="pulse-ui__nav"><button class="pulse-ui__tab" aria-current="page">Reminders</button><button class="pulse-ui__tab">History</button></nav>
    <p class="pulse-ui__eyebrow">Connection</p><p class="pulse-ui__muted">Muted copy</p>
    <section class="pulse-ui__panel"><button class="pulse-ui__button">Refresh</button><button class="pulse-ui__button pulse-ui__button--primary">Save</button><button class="pulse-ui__button pulse-ui__button--danger">Delete</button></section>
    <span class="pulse-ui__badge pulse-ui__badge--due">Due</span><span class="pulse-ui__status-dot"></span>
    <label class="pulse-ui__field">Name<input value="Reminder"></label>
    <button class="pulse-ui__preset" aria-pressed="true">30 minutes</button>
    <p class="pulse-ui__notice" role="alert">Could not save</p>
    <div class="pulse-ui__modal"><div class="pulse-ui__history-icon">✓</div>Modal</div>
    <i class="pulse-theme-probe-tab"></i><i class="pulse-theme-probe-focus"></i><i class="pulse-theme-probe-hover"></i>
  </main></section>`;
}
