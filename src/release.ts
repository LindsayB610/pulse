import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PulseReleaseReadinessResult = {
  checked: string[];
  missing: string[];
};

const requiredReleaseFiles = [
  "docs/backup-and-restore.md",
  "docs/migrations.md",
  "docs/release-checklist.md",
  "docs/security-and-privacy.md",
  "scripts/lint-public-boundary.mjs",
  "test/phase9.test.mjs",
];

const releaseChecklistPatterns = [
  /npm test/,
  /npm run docs:check/,
  /npm run lint/,
  /backup/i,
  /migration/i,
  /security/i,
  /privacy scanner/i,
  /due -> notify -> done -> stop/,
];

export function validatePulseReleaseReadiness(rootPath: string): PulseReleaseReadinessResult {
  const missing: string[] = [];

  for (const file of requiredReleaseFiles) {
    if (!existsSync(join(rootPath, file))) {
      missing.push(`${file} is missing`);
    }
  }

  const releaseChecklistPath = join(rootPath, "docs/release-checklist.md");
  if (existsSync(releaseChecklistPath)) {
    const releaseChecklist = readFileSync(releaseChecklistPath, "utf8");
    for (const pattern of releaseChecklistPatterns) {
      if (!pattern.test(releaseChecklist)) {
        missing.push(`docs/release-checklist.md must mention ${pattern}`);
      }
    }
  }

  return {
    checked: requiredReleaseFiles,
    missing,
  };
}
