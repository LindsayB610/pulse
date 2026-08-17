import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const rootPath = root.pathname;

function read(relativePath) {
  return readFileSync(join(rootPath, relativePath), "utf8");
}

test("phase 0 required repo files exist", () => {
  [
    "README.md",
    "LICENSE",
    ".editorconfig",
    "package.json",
    "tsconfig.json",
    ".gitignore",
    ".env.example",
    "pulses.example.yaml",
    "project-plan.md",
    "src/index.ts",
    "examples/README.md",
    "scripts/check-format.mjs",
    "scripts/lint-public-boundary.mjs",
    "docs/quickstart-local-demo.md",
    "docs/private-config.md",
    "docs/security-and-privacy.md",
  ].forEach((relativePath) => {
    assert.ok(statSync(join(rootPath, relativePath)).isFile(), `${relativePath} should exist`);
  });
});

test("phase 0 package scripts include lint, format, build, docs, and tests", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.scripts.test, "npm run build && npm run build:plugin && npm run typecheck:netlify && node --test test/*.test.mjs && tsx --test test/*.test.ts");
  assert.equal(packageJson.scripts.typecheck, "tsc -p tsconfig.json --noEmit");
  assert.equal(packageJson.scripts["typecheck:netlify"], "tsc -p netlify/tsconfig.json --noEmit");
  assert.match(packageJson.scripts["test:coverage"], /experimental-test-coverage/);
  assert.equal(packageJson.scripts.build, "tsc -p tsconfig.json");
  assert.equal(packageJson.scripts["docs:check"], "node scripts/check-doc-links.mjs");
  assert.equal(packageJson.scripts["format:check"], "node scripts/check-format.mjs");
  assert.equal(packageJson.scripts.lint, "node scripts/lint-public-boundary.mjs");
});

test("public docs explain the private runner boundary", () => {
  const readme = read("README.md");
  assert.match(readme, /public repo contains code, docs, examples, and tests/i);
  assert.match(readme, /private runner owns real pulse definitions/i);
  assert.match(readme, /Do not commit real `pulses\.yaml`/);
});

test("example env keeps credentials blank and points at public demo config", () => {
  const env = read(".env.example");
  assert.match(env, /PULSE_CONFIG_PATH=\.\/pulses\.example\.yaml/);
  assert.match(env, /PULSE_NTFY_TOPIC=\n/);
  assert.doesNotMatch(env, /Lucas|medication|555-|@gmail\.com/i);
});

test("example pulse config is public-safe and includes a repeating weekly demo pulse", () => {
  const yaml = read("pulses.example.yaml");
  assert.match(yaml, /id: weekly-demo-check/);
  assert.match(yaml, /type: weekly/);
  assert.match(yaml, /sunday/);
  assert.match(yaml, /repeatEveryMinutes: 5/);
  assert.doesNotMatch(yaml, /Lucas|medication|shot|phone/i);
});

test("gitignore excludes private config, state, backups, logs, and credentials", () => {
  const gitignore = read(".gitignore");
  [
    ".env",
    "pulses.yaml",
    "state/",
    "data/",
    "backups/",
    "logs/",
    "*.sqlite",
    "*.db",
  ].forEach((pattern) => {
    assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.match(gitignore, /!\.env\.example/);
});

test("public boundary lint discovers nested public files and rejects private topic or token values", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-public-boundary-"));
  try {
    const docsDir = join(dir, "docs", "nested");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Safe\n");
    writeFileSync(join(dir, ".env.example"), "PULSE_NTFY_TOPIC=\n");
    [
      ["dotenv.md", "PULSE_API_TOKEN=not-for-public-docs\n"],
      ["yaml.yaml", "  PULSE_NTFY_TOKEN: yaml-secret\n"],
      ["export.md", "export PULSE_NTFY_TOPIC = spaced-secret\n"],
    ].forEach(([file, content]) => {
      writeFileSync(join(docsDir, file), content);
      const result = spawnSync(process.execPath, ["scripts/lint-public-boundary.mjs"], {
        cwd: rootPath,
        env: { ...process.env, PULSE_PUBLIC_BOUNDARY_ROOT: dir },
        encoding: "utf8",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`docs/nested/${file} assigns a private ntfy topic or token`));
      rmSync(join(docsDir, file));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public boundary lint rejects owner-specific local paths and private identifiers", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-public-identity-boundary-"));
  try {
    mkdirSync(join(dir, "docs"), { recursive: true });
    [
      ["path.md", "/Users/lindsaybrunner/Documents/workshop-private/pulse"],
      ["account.md", "Sign in as lindsayb82"],
      ["topic.md", "this_is_my_new_app_called_pulse_by_guppi"],
    ].forEach(([file, content]) => {
      writeFileSync(join(dir, "docs", file), `${content}\n`);
      const result = spawnSync(process.execPath, ["scripts/lint-public-boundary.mjs"], {
        cwd: rootPath,
        env: { ...process.env, PULSE_PUBLIC_BOUNDARY_ROOT: dir },
        encoding: "utf8",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`docs/${file} contains private-looking example content`));
      rmSync(join(dir, "docs", file));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public boundary lint rejects files below private and state directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-forbidden-private-"));
  try {
    const privateDir = join(dir, "private");
    mkdirSync(privateDir, { recursive: true });
    writeFileSync(join(privateDir, "pulses.yaml"), "pulses: []\n");

    const result = spawnSync(process.execPath, ["scripts/lint-public-boundary.mjs"], {
      cwd: rootPath,
      env: { ...process.env, PULSE_PUBLIC_BOUNDARY_ROOT: dir },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /private\/pulses\.yaml is tracked below a forbidden private or state directory/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
