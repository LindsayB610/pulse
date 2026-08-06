import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("docs checker discovers nested Markdown files instead of relying on a fixed list", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "pulse-docs-check-"));
  mkdirSync(join(fixtureRoot, "docs", "rebuild"), { recursive: true });
  writeFileSync(join(fixtureRoot, "README.md"), "# Root\n");
  writeFileSync(join(fixtureRoot, "docs", "rebuild", "new-phase.md"), "[missing](missing.md)\n");

  try {
    assert.throws(
      () =>
        execFileSync(process.execPath, [join(root, "scripts", "check-doc-links.mjs")], {
          env: { ...process.env, PULSE_DOCS_ROOT: fixtureRoot },
          encoding: "utf8",
          stdio: "pipe",
        }),
      /docs\/rebuild\/new-phase\.md links to missing missing\.md/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
