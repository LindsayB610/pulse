import assert from "node:assert/strict";
import { test } from "node:test";

import {
  setupBack,
  setupForward,
  setupProgress,
  setupStateFromNative,
  type SetupState,
} from "../plugin/src/setup-machine.tsx";

const happyPath: SetupState[] = [
  "welcome",
  "phone-user",
  "phone-topic",
  "phone-subscription",
  "phone-token",
  "runner-choice",
  "runner-deploy",
  "runner-pair",
  "delivery-secret",
  "delivery-test",
  "complete",
];

test("G5 setup machine has deterministic forward and back transitions across the guided path", () => {
  for (let index = 0; index < happyPath.length - 1; index += 1) {
    assert.equal(setupForward(happyPath[index]), happyPath[index + 1]);
    assert.equal(setupBack(happyPath[index + 1]), happyPath[index]);
  }
  assert.equal(setupBack("welcome"), null);
  assert.equal(setupForward("complete"), null);
});

test("G5 native resume state is allowlisted and corrupt state falls back safely", () => {
  for (const state of happyPath.slice(1, -1)) assert.equal(setupStateFromNative(state), state);
  assert.equal(setupStateFromNative("advanced"), "advanced");
  assert.equal(setupStateFromNative("existing"), "existing");
  assert.equal(setupStateFromNative("migration"), "migration");
  assert.equal(setupBack("migration"), "welcome");
  assert.equal(setupStateFromNative("netlify-admin-token"), "welcome");
  assert.equal(setupStateFromNative(""), "welcome");
});

test("G5 progress represents accomplished work rather than recovery destination", () => {
  assert.deepEqual(setupProgress("welcome"), { current: 0, total: 7, label: "Before you start" });
  assert.deepEqual(setupProgress("phone-token"), { current: 2, total: 7, label: "Phone" });
  assert.deepEqual(setupProgress("runner-pair"), { current: 4, total: 7, label: "Connect" });
  assert.deepEqual(setupProgress("delivery-test"), { current: 6, total: 7, label: "Test" });
  assert.deepEqual(setupProgress("complete"), { current: 7, total: 7, label: "Ready" });
});
