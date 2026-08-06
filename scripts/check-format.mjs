import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.env.PULSE_FORMAT_ROOT ?? new URL("../", import.meta.url).pathname;
const files = discoverFiles(root);

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

function discoverFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if ([".git", ".netlify", "coverage", "dist", "node_modules", "private", "state"].includes(entry.name)) {
          return [];
        }
        return discoverFiles(absolutePath);
      }
      if (
        [".md", ".mjs", ".ts", ".yaml", ".yml", ".json"].includes(extname(entry.name)) ||
        [".editorconfig", ".env.example", ".gitignore", "Dockerfile"].includes(entry.name)
      ) {
        return [relative(root, absolutePath)];
      }
      return [];
    })
    .sort();
}
