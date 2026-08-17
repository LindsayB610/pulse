import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";

const htmlUrl = new URL("../design/onboarding-prototype/index.html", import.meta.url);
const cssUrl = new URL("../design/onboarding-prototype/onboarding.css", import.meta.url);
const scriptUrl = new URL("../design/onboarding-prototype/onboarding.js", import.meta.url);
const guideUrl = new URL("../design/guided-setup-README.md", import.meta.url);

test("G1 has a redacted, non-leading usability protocol and decision rubric", async () => {
  const guide = await readFile(guideUrl, "utf8");

  for (const section of [
    "## Direction A — Guided Journey",
    "## Direction B — Readiness Board",
    "## Direction C — Companion Split View",
    "## Decision rubric",
    "## Unmoderated task script",
    "## Observation record",
    "## G1 exit gate",
  ]) {
    assert.match(guide, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(guide, /observer may not tell the participant where to click/i);
  assert.match(guide, /two unfamiliar nondevelopers/i);
  assert.match(guide, /confirmed test notification/i);
  assert.match(guide, /\*\*Selected direction:\*\* a phase-aware Companion Split View/i);
  assert.match(guide, /Owner observation 1 — failed doorway/i);
  assert.match(guide, /Retest required.*yes/is);
  assert.match(guide, /python3 -m http\.server 4179 --bind 127\.0\.0\.1(?:\s|`)/);
  assert.match(guide, /\/design\/onboarding-prototype\/#\/selected\/welcome/);
  assert.doesNotMatch(guide, /this_is_my_new_app_called_pulse_by_guppi|lindsayb82|mounjaro|lindsaybrunner/i);
});

test("G1 compares three structurally different setup directions with the complete state inventory", async () => {
  const [html, css, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);
  const artifact = `${html}\n${css}\n${script}`;

  for (const direction of ["Guided Journey", "Readiness Board", "Companion Split View"]) {
    assert.match(script, new RegExp(direction));
  }
  for (const step of ["welcome", "phone", "runner", "pairing", "delivery", "test", "complete"]) {
    assert.match(script, new RegExp(`(?:id: "${step}"|/${step})`));
  }
  for (const phoneStep of ["phone-reserve", "phone-subscribe", "phone-token"]) {
    assert.match(script, new RegExp(phoneStep));
  }
  for (const state of [
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
  ]) {
    assert.match(script, new RegExp(`(?:id: "${state}"|state/${state})`));
  }

  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.pulse-setup/);
  assert.match(css, /\.pulse-setup \[hidden\][^{]*\{[^}]*display:\s*none\s*!important/s);
  assert.match(html, /Skip to setup/);
  assert.doesNotMatch(artifact, /this_is_my_new_app_called_pulse_by_guppi|lindsayb82|mounjaro|lindsaybrunner/i);
  assert.doesNotMatch(artifact, /name=["'](?:token|api-token|ntfy-token)["']/i);
});

test("G1 shared buttons give wrapped labels deliberate vertical rhythm", async () => {
  const css = await readFile(cssUrl, "utf8");
  const sharedButtonRule = css.match(
    /\.pulse-setup__button,\s*\.pulse-setup a\.pulse-setup__button\s*\{(?<body>[^}]+)\}/s,
  )?.groups?.body;

  assert.ok(sharedButtonRule, "the scoped shared button rule exists");
  assert.match(sharedButtonRule, /padding:\s*12px 18px/);
  assert.match(sharedButtonRule, /line-height:\s*1\.25/);
  assert.match(sharedButtonRule, /text-align:\s*center/);
  assert.match(sharedButtonRule, /white-space:\s*normal/);
});

test("G1 browser handoff action stays compact instead of becoming a content box", async () => {
  const css = await readFile(cssUrl, "utf8");
  const handoffActionRule = css.match(/\.pulse-setup__button--handoff\s*\{(?<body>[^}]+)\}/s)?.groups?.body;

  assert.match(handoffActionRule ?? "", /width:\s*fit-content/);
  assert.match(handoffActionRule ?? "", /justify-self:\s*start/);
});

test("G1 recovery labels and narrow companion context preserve task hierarchy", async () => {
  const css = await readFile(cssUrl, "utf8");
  const surfaceRule = css.match(/\.pulse-setup__surface-label\s*\{(?<body>[^}]+)\}/s)?.groups?.body;
  assert.match(surfaceRule ?? "", /display:\s*flex/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.pulse-setup__companion-intro[^{]*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.pulse-setup__phone-progress\s*\{[^}]*display:\s*none/);
});

test("G1 readiness-board runner choices do not collapse into three cramped columns", async () => {
  const css = await readFile(cssUrl, "utf8");
  const boardPanelRule = css.match(/\.pulse-setup__board-panel\s*\{(?<body>[^}]+)\}/s)?.groups?.body;
  const boardChoiceRule = css.match(/\.pulse-setup__board-panel \.pulse-setup__choice\s*\{(?<body>[^}]+)\}/s)?.groups
    ?.body;
  const boardMetaRule = css.match(/\.pulse-setup__board-panel \.pulse-setup__choice-meta\s*\{(?<body>[^}]+)\}/s)?.groups
    ?.body;

  assert.match(boardPanelRule ?? "", /padding:\s*0/);
  assert.match(boardPanelRule ?? "", /overflow:\s*hidden/);
  assert.match(boardChoiceRule ?? "", /grid-template-columns:\s*42px minmax\(0, 1fr\)/);
  assert.match(boardMetaRule ?? "", /grid-column:\s*2/);
  assert.match(boardMetaRule ?? "", /justify-items:\s*start/);
});

test("G1 clickable choice cards do not decorate every descendant like link text", async () => {
  const css = await readFile(cssUrl, "utf8");
  const choiceRule = css.match(/\.pulse-setup__choice\s*\{(?<body>[^}]+)\}/s)?.groups?.body;

  assert.ok(choiceRule, "the scoped choice-card rule exists");
  assert.match(choiceRule, /text-decoration:\s*none/);
});

test("G1 contextual badges keep breathing room before card headings", async () => {
  const css = await readFile(cssUrl, "utf8");
  const badgeRule = css.match(/\.pulse-setup__pill,\s*\.pulse-setup__badge\s*\{(?<body>[^}]+)\}/s)?.groups?.body;
  const badgeHeadingRule = css.match(
    /\.pulse-setup__badge \+ \.pulse-setup__card-title,\s*\.pulse-setup__badge \+ \.pulse-setup__subheading\s*\{(?<body>[^}]+)\}/s,
  )?.groups?.body;

  assert.match(badgeRule ?? "", /width:\s*fit-content/);
  assert.ok(badgeHeadingRule, "the badge-to-heading rhythm is shared across cards");
  assert.match(badgeHeadingRule, /margin-top:\s*20px/);
});

test("G1 status chips never wrap internally and their containers wrap whole chips", async () => {
  const css = await readFile(cssUrl, "utf8");
  const badgeRule = css.match(/\.pulse-setup__pill,\s*\.pulse-setup__badge\s*\{(?<body>[^}]+)\}/s)?.groups?.body;
  const noticeHeadRule = css.match(/\.pulse-setup__notice-head\s*\{(?<body>[^}]+)\}/s)?.groups?.body;

  assert.match(badgeRule ?? "", /white-space:\s*nowrap/);
  assert.match(noticeHeadRule ?? "", /flex-wrap:\s*wrap/);
});

test("G1 fact copy styles cannot override number-marker alignment", async () => {
  const css = await readFile(cssUrl, "utf8");
  const numberRule = css.match(/\.pulse-setup__fact-icon\.is-number\s*\{(?<body>[^}]+)\}/s)?.groups?.body;

  assert.match(numberRule ?? "", /border-radius:\s*50%/);
  assert.match(css, /\.pulse-setup__facts > li > span:last-child > span/);
  assert.doesNotMatch(css, /\.pulse-setup__facts span\s*\{/);
});

test("G1 phone instructions use the same circular number language", async () => {
  const css = await readFile(cssUrl, "utf8");
  const phoneNumberRule = css.match(/\.pulse-setup__phone-instructions li::before\s*\{(?<body>[^}]+)\}/s)?.groups
    ?.body;

  assert.match(phoneNumberRule ?? "", /place-items:\s*center/);
  assert.match(phoneNumberRule ?? "", /border-radius:\s*50%/);
  assert.match(phoneNumberRule ?? "", /font-variant-numeric:\s*tabular-nums/);
});

test("G1 completed states do not depend on font-specific check glyphs", async () => {
  const [css, script] = await Promise.all([readFile(cssUrl, "utf8"), readFile(scriptUrl, "utf8")]);

  assert.doesNotMatch(script, /["']✓["']/);
  assert.doesNotMatch(css, /content:\s*["']✓["']/);
});

test("G1 evidence contains desktop comparisons, complete flows, failures, and narrow stress renders", async () => {
  const evidence = new URL("../design/onboarding-evidence/", import.meta.url);
  const required = [
    "compare-desktop.jpg",
    "compare-narrow.jpg",
    ...["journey", "board", "companion"].flatMap((direction) =>
      ["welcome", "phone", "runner", "pairing", "delivery", "test", "complete"].map(
        (step) => `${direction}-${step}-desktop.jpg`,
      ),
    ),
    ...[
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
    ].flatMap((state) => [
      `journey-state-${state}-desktop.jpg`,
      `journey-state-${state}-narrow.jpg`,
    ]),
    ...["phone", "runner", "delivery", "test"].map((state) => `journey-${state}-narrow.jpg`),
    "journey-phone-zoom-200.jpg",
    "companion-welcome-narrow.jpg",
    "companion-state-existing-installation-desktop.jpg",
    "companion-state-advanced-desktop.jpg",
    "companion-state-advanced-narrow.jpg",
    "selected-welcome-desktop.jpg",
    "selected-welcome-narrow.jpg",
    ...["phone", "runner", "pairing", "delivery", "test", "test-sent", "complete"].map(
      (step) => `selected-${step}-desktop.jpg`,
    ),
    ...["phone-reserve", "phone-subscribe", "phone-token"].flatMap((step) => [
      `selected-${step}-desktop.jpg`,
      `selected-${step}-narrow.jpg`,
    ]),
    ...["phone", "runner", "pairing", "delivery", "test", "test-sent", "complete"].map(
      (step) => `selected-${step}-narrow.jpg`,
    ),
    ...[
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
    ].flatMap((state) => [
      `selected-state-${state}-desktop.jpg`,
      `selected-state-${state}-narrow.jpg`,
    ]),
    "selected-state-advanced-desktop.jpg",
    "selected-existing-desktop.jpg",
    "selected-existing-narrow.jpg",
    "selected-state-advanced-narrow.jpg",
  ];

  for (const file of required) {
    const metadata = await stat(new URL(file, evidence));
    assert.ok(metadata.size > 10_000, `${file} is a real rendered evidence file`);
  }
});
