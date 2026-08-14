import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const styles = readFileSync("plugin/src/styles.tsx", "utf8");

const requiredHostFallbacks = new Map([
  ["canvas", "#000000"],
  ["surface", "rgba(255,255,255,.045)"],
  ["surface-raised", "#151519"],
  ["border", "rgba(255,255,255,.11)"],
  ["text", "#f7f7f8"],
  ["text-muted", "#9f9fa8"],
  ["accent", "#ff2f92"],
  ["accent-strong", "#ff2f92"],
  ["accent-warm", "#ffe600"],
  ["focus-ring", "rgba(255,230,0,.82)"],
  ["success", "#5ee49b"],
  ["warning", "#ffe600"],
  ["danger", "#ff8dbd"],
]);

test("Pulse adopts every stable semantic host token with its exact standalone fallback", () => {
  for (const [name, fallback] of requiredHostFallbacks) {
    assert.ok(
      styles.includes(`--pulse-${name}: var(--workshop-${name}, ${fallback});`),
      `missing --workshop-${name} with Pulse fallback ${fallback}`,
    );
  }

  assert.doesNotMatch(styles, /var\(--workshop-[\w-]+\s*\)/, "every Workshop token reference must include a fallback");
  assert.doesNotMatch(styles, /--workshop-gradient-/, "Pulse has no genuine gradient treatment");
  assert.doesNotMatch(styles, /--pulse-(?:pink|yellow|green)/, "Pulse aliases must describe semantic roles, not colors");
  assert.doesNotMatch(styles, /data-theme|palette(?:Id|-id)|preset(?:Id|-id)/, "Pulse must not branch on host theme identity");
});

test("Pulse applies inherited semantic roles to every representative interface state", () => {
  const requiredRules = [
    [/\.pulse-ui \{[^}]*background: var\(--pulse-canvas\);[^}]*color: var\(--pulse-text\)/s, "root canvas and text"],
    [/\.pulse-ui__tab\[aria-current='page'\] \{[^}]*color: var\(--pulse-text\);[^}]*var\(--pulse-accent-soft\)/s, "selected tab"],
    [/\.pulse-ui :focus-visible \{[^}]*var\(--pulse-focus-ring\)/s, "focus indicator"],
    [/\.pulse-ui__button \{[^}]*var\(--pulse-border\)[^}]*var\(--pulse-control-surface\)/s, "controls"],
    [/\.pulse-ui__button--primary \{[^}]*var\(--pulse-on-action\)[^}]*var\(--pulse-accent-warm\)/s, "primary action"],
    [/\.pulse-ui__button--danger \{[^}]*var\(--pulse-danger\)/s, "danger action"],
    [/\.pulse-ui__stat, \.pulse-ui__card, \.pulse-ui__panel \{[^}]*var\(--pulse-border\)[^}]*var\(--pulse-surface\)/s, "panels"],
    [/\.pulse-ui__badge--due \{[^}]*var\(--pulse-warning\)/s, "due status"],
    [/\.pulse-ui__status-dot \{[^}]*var\(--pulse-success\)/s, "online status"],
    [/\.pulse-ui__field input, \.pulse-ui__field select \{[^}]*var\(--pulse-input-border\)[^}]*var\(--pulse-text\)[^}]*var\(--pulse-input-surface\)/s, "inputs"],
    [/\.pulse-ui__history-icon \{[^}]*var\(--pulse-success\)/s, "history state"],
    [/\.pulse-ui__notice\[role='alert'\] \{[^}]*var\(--pulse-alert\)/s, "error notice"],
    [/\.pulse-ui__modal \{[^}]*var\(--pulse-modal-border\)[^}]*var\(--pulse-text\)[^}]*var\(--pulse-surface-raised\)/s, "modal"],
  ];

  for (const [pattern, description] of requiredRules) assert.match(styles, pattern, description);
});

test("all production plugin selectors remain scoped to Pulse", () => {
  assert.doesNotMatch(styles, /(?:^|\n)\s*(?:html|body|:root|button|input|select)\b/);
  for (const match of styles.matchAll(/(?:^|\n)([^@\n][^{\n]+)\{/g)) {
    for (const selector of match[1].split(",")) {
      assert.match(selector.trim(), /^\.pulse-ui(?:\b|__)/, `unscoped selector: ${selector.trim()}`);
    }
  }
});

test("a representative inherited dark palette keeps rendered semantic pairs readable", () => {
  const palette = {
    canvas: "#071116",
    surface: "#0d1d24",
    surfaceRaised: "#1e2d33",
    border: "#5f6a70",
    text: "#ffffff",
    textMuted: "#b7b7bd",
    accent: "#2bb7e8",
    accentStrong: "#60c8eb",
    accentWarm: "#62e6bd",
    focusRing: "#62e6bd",
    success: "#56d68b",
    warning: "#ffd34d",
    danger: "#ff5a79",
  };
  const pairs = [
    [palette.text, palette.canvas, 4.5, "page text"],
    [palette.text, palette.surface, 4.5, "panel and selected-tab text"],
    [palette.text, palette.surfaceRaised, 4.5, "control, input, and modal text"],
    [palette.textMuted, palette.canvas, 4.5, "muted page text"],
    [palette.textMuted, palette.surface, 4.5, "muted panel text"],
    [palette.border, palette.surface, 3, "panel and control borders"],
    [palette.accent, palette.surface, 3, "accent text"],
    [palette.accentStrong, palette.surface, 3, "selected-state border"],
    [palette.canvas, palette.accentWarm, 4.5, "primary action text"],
    [palette.success, palette.surface, 3, "success status"],
    [palette.warning, palette.surface, 3, "warning status"],
    [palette.danger, palette.surface, 3, "danger status"],
    [palette.focusRing, palette.surface, 3, "focus indicator"],
  ];

  for (const [foreground, background, minimum, description] of pairs) {
    assert.ok(contrast(foreground, background) >= minimum, `${description} must reach ${minimum}:1`);
  }
});

function contrast(first, second) {
  const [bright, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
