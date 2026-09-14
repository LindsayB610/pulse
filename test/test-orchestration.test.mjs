import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("JSDOM-heavy date-picker checks run in an isolated process in normal and coverage gates", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const runner = readFileSync(new URL("../scripts/run-mjs-tests.mjs", import.meta.url), "utf8");

  assert.match(packageJson.scripts.test, /run-mjs-tests\.mjs/);
  assert.match(packageJson.scripts["test:coverage"], /run-mjs-tests\.mjs --coverage/);
  assert.match(runner, /plugin-date-picker\.test\.mjs/);
  assert.match(runner, /test-coverage-include=plugin\/dist\/date-picker\.js/);
  assert.match(runner, /test-coverage-branches=90/);
  assert.match(runner, /test-coverage-functions=100/);
});
