import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const files = [
  ".editorconfig",
  ".env.example",
  ".gitignore",
  "Dockerfile",
  "README.md",
  "deploy/docker-compose.yml",
  "bin/pulse-runner.mjs",
  "bin/pulse-done.mjs",
  "bin/pulse-state.mjs",
  "bin/pulse-ui.mjs",
  "docs/backup-and-restore.md",
  "docs/deploy-runner.md",
  "docs/env-vars.md",
  "docs/notification-adapters.md",
  "docs/operations.md",
  "docs/private-config.md",
  "docs/migrations.md",
  "docs/release-checklist.md",
  "docs/quickstart-local-demo.md",
  "docs/security-and-privacy.md",
  "docs/verify-runner.md",
  "examples/README.md",
  "examples/forced-test-pulse.yaml",
  "package.json",
  "project-plan.md",
  "pulses.example.yaml",
  "src/adapters.ts",
  "src/index.ts",
  "src/model.ts",
  "src/release.ts",
  "src/runner.ts",
  "src/storage.ts",
  "src/ui.ts",
  "test/phase0.test.mjs",
  "test/phase1.test.mjs",
  "test/phase2.test.mjs",
  "test/phase3.test.mjs",
  "test/phase4.test.mjs",
  "test/phase5.test.mjs",
  "test/phase6.test.mjs",
  "test/phase7.test.mjs",
  "test/phase9.test.mjs",
  "scripts/check-doc-links.mjs",
  "scripts/check-format.mjs",
  "scripts/lint-public-boundary.mjs",
];

const failures = [];

for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  if (!text.endsWith("\n")) {
    failures.push(`${file} must end with a newline`);
  }
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (/[ \t]$/.test(line)) {
      failures.push(`${file}:${index + 1} has trailing whitespace`);
    }
    if (line.includes("\t")) {
      failures.push(`${file}:${index + 1} contains a tab`);
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked formatting for ${files.length} files.`);
