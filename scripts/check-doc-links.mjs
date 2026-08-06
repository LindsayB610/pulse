import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative } from "node:path";

const root = process.env.PULSE_DOCS_ROOT ?? new URL("../", import.meta.url).pathname;
const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const files = findMarkdownFiles(root);

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

function findMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : findMarkdownFiles(join(directory, entry.name));
      }

      return entry.isFile() && extname(entry.name).toLowerCase() === ".md"
        ? [relative(root, join(directory, entry.name))]
        : [];
    })
    .sort();
}
