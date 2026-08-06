import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.env.PULSE_PUBLIC_BOUNDARY_ROOT ?? new URL("../", import.meta.url).pathname;
const publicFiles = discoverPublicFiles(root);
const blockedPatterns = [/Lucas/i, /\bmedication\b/i, /\bshot\b/i, /555-\d{4}/, /@gmail\.com/i];
const privateValuePattern =
  /^[ \t]*(?:export[ \t]+)?PULSE_(?:NTFY_TOPIC|NTFY_TOKEN|API_TOKEN)[ \t]*(?:=|:)[ \t]*(?!$|#)[^\s]/m;
const failures = [];

for (const file of discoverTrackedPrivateFiles(root)) {
  failures.push(`${file} is tracked below a forbidden private or state directory`);
}

for (const file of publicFiles) {
  const text = readFileSync(join(root, file), "utf8");
  for (const pattern of blockedPatterns) {
    if (pattern.test(text)) {
      failures.push(`${file} contains private-looking example content matching ${pattern}`);
    }
  }
  if (privateValuePattern.test(text)) {
    failures.push(`${file} assigns a private ntfy topic or token in public content`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked public boundary for ${publicFiles.length} files.`);

function discoverTrackedPrivateFiles(directory) {
  try {
    return execFileSync("git", ["-C", directory, "ls-files", "--", "private", "state"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .sort();
  } catch {
    return discoverForbiddenFiles(directory);
  }
}

function discoverForbiddenFiles(directory) {
  return ["private", "state"].flatMap((name) => {
    const path = join(directory, name);
    try {
      return readdirSync(path, { recursive: true }).map((file) => join(name, file));
    } catch {
      return [];
    }
  });
}

function discoverPublicFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if ([".git", "coverage", "dist", "node_modules", "private", "state"].includes(entry.name)) {
          return [];
        }
        return discoverPublicFiles(absolutePath);
      }
      if (entry.name === ".env.example" || [".md", ".yaml", ".yml"].includes(extname(entry.name))) {
        return [relative(root, absolutePath)];
      }
      return [];
    })
    .sort();
}
