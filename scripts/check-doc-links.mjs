import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const files = [
  "README.md",
  "project-plan.md",
  "examples/README.md",
  "docs/quickstart-local-demo.md",
  "docs/private-config.md",
  "docs/env-vars.md",
  "docs/deploy-runner.md",
  "docs/notification-adapters.md",
  "docs/verify-runner.md",
  "docs/operations.md",
  "docs/security-and-privacy.md",
  "docs/backup-and-restore.md",
  "docs/migrations.md",
  "docs/release-checklist.md",
];

const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
const missing = [];

for (const file of files) {
  const absolutePath = join(root, file);
  if (!existsSync(absolutePath)) {
    missing.push(`${file} is missing`);
    continue;
  }

  const markdown = readFileSync(absolutePath, "utf8");
  for (const match of markdown.matchAll(linkPattern)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) {
      continue;
    }

    const [targetPath] = target.split("#");
    if (!targetPath) {
      continue;
    }

    const resolved = normalize(join(root, dirname(file), targetPath));
    if (!existsSync(resolved)) {
      missing.push(`${file} links to missing ${target}`);
    }
  }
}

if (missing.length > 0) {
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log(`Checked ${files.length} markdown files.`);
