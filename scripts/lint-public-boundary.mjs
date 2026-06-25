import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const publicFiles = [
  ".env.example",
  "README.md",
  "docs/private-config.md",
  "docs/security-and-privacy.md",
  "examples/README.md",
  "pulses.example.yaml",
];
const blockedPatterns = [/Mounjaro/i, /Lucas/i, /\bmedication\b/i, /\bshot\b/i, /555-\d{4}/, /@gmail\.com/i];
const failures = [];

for (const file of publicFiles) {
  const text = readFileSync(join(root, file), "utf8");
  for (const pattern of blockedPatterns) {
    if (pattern.test(text)) {
      failures.push(`${file} contains private-looking example content matching ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked public boundary for ${publicFiles.length} files.`);
