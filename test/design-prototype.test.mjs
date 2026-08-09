import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";

const htmlPath = new URL("../design/prototype/index.html", import.meta.url);
const cssPath = new URL("../design/prototype/prototype.css", import.meta.url);
const jsPath = new URL("../design/prototype/prototype.js", import.meta.url);

test("D0 prototype exposes every required product state without private data", async () => {
  const [html, css, script] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(cssPath, "utf8"),
    readFile(jsPath, "utf8"),
  ]);
  const artifact = `${html}\n${css}\n${script}`;

  for (const route of ["compare", "reminders", "empty", "new", "edit", "history", "history-empty", "settings", "setup"]) {
    assert.match(script, new RegExp(`(?:name === \\"${route}\\"|#/${route})`));
  }
  for (const direction of ["Quiet Focus", "Soft Ledger", "Signal Grid"]) assert.match(script, new RegExp(direction));
  for (const state of ["Due now", "Paused", "Runner is online", "Runner check is late", "Runner is unavailable", "No reminders yet", "No completed reminders yet"]) assert.match(script, new RegExp(state));
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /Skip to Pulse/);
  assert.match(script, /role=\"dialog\" aria-modal=\"true\"/);
  assert.doesNotMatch(artifact, /this_is_my_new_app_called_pulse_by_guppi|lindsayb82|mounjaro|authorization:|bearer\s+[a-z0-9]/i);
});

test("D0 prototype keeps occurrence actions on the phone and management in Workshop", async () => {
  const script = await readFile(jsPath, "utf8");
  assert.match(script, /Phone actions stay on your phone/);
  assert.match(script, /Edit/);
  assert.match(script, /Pause/);
  assert.match(script, /Delete reminder/);
  assert.doesNotMatch(script, /data-action=.[\"'](?:done|snooze)/i);
});

test("D0 evidence includes desktop-first and narrow safety renders for every required state", async () => {
  const evidence = new URL("../design/evidence/", import.meta.url);
  const required = [
    "compare-desktop.jpg",
    "compare-narrow.jpg",
    "quiet-focus-reminders-desktop.jpg",
    "soft-ledger-reminders-desktop.jpg",
    "signal-grid-reminders-desktop.jpg",
    ...["reminders", "empty", "new-reminder", "edit-reminder", "history", "history-empty", "settings", "settings-stale", "settings-unavailable", "setup", "setup-error"]
      .flatMap((state) => [`${state}-desktop.jpg`, `${state}-narrow.jpg`]),
  ];
  for (const file of required) {
    const metadata = await stat(new URL(file, evidence));
    assert.ok(metadata.size > 10_000, `${file} is a real rendered evidence file`);
  }
});
