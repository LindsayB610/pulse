import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("format checker discovers nested rebuild artifacts", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-format-check-"));
  try {
    const docsDir = join(dir, "docs", "rebuild");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "future-phase.md"), "# Missing final newline");

    const result = spawnSync(process.execPath, ["scripts/check-format.mjs"], {
      cwd: root,
      env: { ...process.env, PULSE_FORMAT_ROOT: dir },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/rebuild\/future-phase\.md must end with a newline/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
