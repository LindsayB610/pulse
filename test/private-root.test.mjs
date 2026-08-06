import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { validatePrivateRoot } from "../scripts/private-root.mjs";

const publicRoot = new URL("../", import.meta.url).pathname;

test("private-root preflight requires an absolute path outside the public checkout", () => {
  const externalRoot = mkdtempSync(join(tmpdir(), "pulse-private-root-"));
  try {
    assert.equal(validatePrivateRoot(externalRoot, publicRoot), realpathSync(externalRoot));
    assert.throws(() => validatePrivateRoot("private", publicRoot), /must be an absolute path/);
    assert.throws(() => validatePrivateRoot(publicRoot, publicRoot), /must be outside/);
    const linkedRoot = join(externalRoot, "linked-public-root");
    symlinkSync(publicRoot, linkedRoot);
    assert.throws(() => validatePrivateRoot(linkedRoot, publicRoot), /must be outside/);
  } finally {
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

test("private-root preflight also rejects a root inside the Workshop checkout", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "pulse-public-roots-"));
  const pulseRoot = join(fixtureRoot, "pulse");
  const workshopRoot = join(fixtureRoot, "workshop");
  const workshopPrivateRoot = join(workshopRoot, "tools", "pulse");
  mkdirSync(workshopPrivateRoot, { recursive: true });
  try {
    assert.throws(
      () => validatePrivateRoot(workshopPrivateRoot, pulseRoot, [workshopRoot]),
      /outside the public Pulse and Workshop checkouts/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("pulse-compose refuses an invalid private root before invoking Docker", () => {
  const result = spawnSync(process.execPath, ["bin/pulse-compose.mjs", "ps"], {
    cwd: publicRoot,
    env: { ...process.env, PULSE_PRIVATE_ROOT: "private" },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /PULSE_PRIVATE_ROOT must be an absolute path/);
});
