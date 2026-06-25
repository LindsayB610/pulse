import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const rootPath = root.pathname;

function read(relativePath) {
  return readFileSync(join(rootPath, relativePath), "utf8");
}

test("phase 0 required repo files exist", () => {
  [
    "README.md",
    "LICENSE",
    ".editorconfig",
    "package.json",
    "tsconfig.json",
    ".gitignore",
    ".env.example",
    "pulses.example.yaml",
    "project-plan.md",
    "src/index.ts",
    "examples/README.md",
    "scripts/check-format.mjs",
    "scripts/lint-public-boundary.mjs",
    "docs/quickstart-local-demo.md",
    "docs/private-config.md",
    "docs/security-and-privacy.md",
  ].forEach((relativePath) => {
    assert.ok(statSync(join(rootPath, relativePath)).isFile(), `${relativePath} should exist`);
  });
});

test("phase 0 package scripts include lint, format, build, docs, and tests", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.scripts.test, "npm run build && node --test test/*.test.mjs");
  assert.equal(packageJson.scripts.typecheck, "tsc -p tsconfig.json --noEmit");
  assert.equal(packageJson.scripts.build, "tsc -p tsconfig.json");
  assert.equal(packageJson.scripts["docs:check"], "node scripts/check-doc-links.mjs");
  assert.equal(packageJson.scripts["format:check"], "node scripts/check-format.mjs");
  assert.equal(packageJson.scripts.lint, "node scripts/lint-public-boundary.mjs");
});

test("public docs explain the private runner boundary", () => {
  const readme = read("README.md");
  assert.match(readme, /public repo contains code, docs, examples, and tests/i);
  assert.match(readme, /private runner owns real pulse definitions/i);
  assert.match(readme, /Do not commit real `pulses\.yaml`/);
});

test("example env keeps credentials blank and points at public demo config", () => {
  const env = read(".env.example");
  assert.match(env, /PULSE_CONFIG_PATH=\.\/pulses\.example\.yaml/);
  assert.match(env, /PULSE_TWILIO_AUTH_TOKEN=\n/);
  assert.doesNotMatch(env, /Mounjaro|Lucas|medication|555-|@gmail\.com/i);
});

test("example pulse config is public-safe and includes a repeating weekly demo pulse", () => {
  const yaml = read("pulses.example.yaml");
  assert.match(yaml, /id: weekly-demo-check/);
  assert.match(yaml, /type: weekly/);
  assert.match(yaml, /sunday/);
  assert.match(yaml, /repeatEveryMinutes: 30/);
  assert.doesNotMatch(yaml, /Mounjaro|Lucas|medication|shot|phone|sms/i);
});

test("gitignore excludes private config, state, backups, logs, and credentials", () => {
  const gitignore = read(".gitignore");
  [
    ".env",
    "pulses.yaml",
    "state/",
    "data/",
    "backups/",
    "logs/",
    "*.sqlite",
    "*.db",
  ].forEach((pattern) => {
    assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.match(gitignore, /!\.env\.example/);
});
