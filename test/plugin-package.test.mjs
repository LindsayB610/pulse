import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { createPulseService, createWorkshopSecureServiceRequester, parsePulsePrivateConfig, pulseDefinitionFromForm, workshopPluginDeclaration } from "../plugin/dist/index.js";

const source = readFileSync("plugin/src/index.tsx", "utf8");
const service = readFileSync("plugin/src/service.ts", "utf8");
const definition = readFileSync("plugin/src/definition.ts", "utf8");
const styles = readFileSync("plugin/src/styles.tsx", "utf8");
const rootPackage = readFileSync("package.json", "utf8");
const pluginPackage = readFileSync("plugin/package.json", "utf8");
const rootLock = readFileSync("package-lock.json", "utf8");
const pluginLock = readFileSync("plugin/package-lock.json", "utf8");
const license = readFileSync("LICENSE", "utf8");

function sourceFilesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesBelow(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function dependencyEntries(manifest) {
  const entries = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].includes(key) && child && typeof child === "object") {
        entries.push(...Object.entries(child));
      }
      visit(child);
    }
  };
  visit(JSON.parse(manifest));
  return entries;
}

function importSpecifiers(sourceText) {
  const specifiers = [];
  const pattern = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g;
  for (const match of sourceText.matchAll(pattern)) specifiers.push(match[2]);
  return specifiers;
}

function isWorkshopSourceSpecifier(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return /(?:^|\/)workshop(?:\/|$)/i.test(specifier);
  return /workshop/i.test(specifier);
}

test("Pulse owns an external planned Workshop plugin without Workshop source imports", () => {
  assert.match(source, /export const workshopPluginDeclaration/);
  assert.match(source, /export function WorkshopToolView/);
  assert.match(source, /navigationMode: "plugin"/);
  assert.match(source, /status: "ready"/);
  assert.match(source, /request_configured_secure_service/);
  assert.match(source, /Pulse connection/);
  assert.match(source, /Connect your reminders/);
  assert.match(source, /Credentials stay in the macOS Keychain and never enter this view/);
  assert.match(source, /Keep the important things moving/);
  assert.match(source, /Completion history/);
  assert.match(source, /Android push through ntfy/);
  assert.match(source, /Change folder/);
  assert.doesNotMatch(source, />Reconnect</);
  assert.doesNotMatch(source, /requestWorkspaceRoot\(undefined\)/);
  assert.match(styles, /\.pulse-ui__lede--wide \{ max-width: 780px; \}/);
  assert.match(source, /useEffect\(\(\) => \{ void refresh\(\); \}, \[refresh\]\)/);
  for (const file of sourceFilesBelow("plugin/src")) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      assert.equal(isWorkshopSourceSpecifier(specifier), false, `${file} must not import Workshop source or package ${specifier}`);
    }
  }
  for (const manifest of [rootPackage, pluginPackage, rootLock, pluginLock]) {
    for (const [name, specifier] of dependencyEntries(manifest)) {
      assert.doesNotMatch(name, /workshop/i, `forbidden Workshop package dependency: ${name}`);
      if (typeof specifier === "string") {
        assert.doesNotMatch(specifier, /(?:file:|link:|workspace:|git\+file:).*workshop/i, `forbidden Workshop source dependency: ${specifier}`);
      }
    }
  }
  assert.match(service, /pulsePath\("\/api\/v1\/snapshot"\)/);
  assert.doesNotMatch(service, /authorization|token|fetch\(/i);
  assert.match(definition, /Enter a reminder name/);
  assert.match(definition, /repeatEveryMinutes/);
  assert.doesNotMatch(source, /Delivery retry|Repeat while due|Repeat notification minutes/);
});

test("the public root and distributable plugin declare the repository MIT license", () => {
  assert.equal(JSON.parse(rootPackage).license, "MIT");
  assert.equal(JSON.parse(pluginPackage).license, "MIT");
  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2026 Lindsay Brunner/);
});

test("dependency-boundary detection covers package, alias, side-effect, dynamic, and relative Workshop imports", () => {
  const forbidden = importSpecifiers(`
    import "@workshop/runtime";
    import view from "@marketing-builds/workshop";
    const lazy = import("workshop/plugin");
    const legacy = require("../workshop/src/native");
  `);
  assert.deepEqual(forbidden, ["@workshop/runtime", "@marketing-builds/workshop", "workshop/plugin", "../workshop/src/native"]);
  for (const specifier of forbidden) assert.equal(isWorkshopSourceSpecifier(specifier), true);
  assert.equal(isWorkshopSourceSpecifier("./workshop-host.js"), false, "Pulse's local generic host adapter remains allowed");
});

test("built plugin validates private metadata and never puts credentials in service requests", async () => {
  assert.deepEqual(parsePulsePrivateConfig({ version: 1, endpoint: "https://pulse.example", credentialRef: "pulse-api-token" }), { version: 1, endpoint: "https://pulse.example", credentialRef: "pulse-api-token" });
  assert.throws(() => parsePulsePrivateConfig({ version: 1, endpoint: "http://pulse.example", credentialRef: "x" }), /HTTPS/);
  assert.throws(() => parsePulsePrivateConfig({ version: 1, endpoint: "https://pulse.example/api", credentialRef: "x" }), /origin/);
  const requests = [];
  const service = createPulseService(async (request) => { requests.push(request); return { status: 200, body: {} }; });
  await service.create(pulseDefinitionFromForm({ title: "Weekly reminder", day: "sunday", time: "09:30", timezone: "America/Los_Angeles" }));
  await service.snapshot();
  await service.update("weekly/reminder", { active: false });
  await service.remove("weekly/reminder");
  assert.deepEqual(requests[0], { method: "POST", path: "/api/v1/pulses", body: { id: "weekly-reminder", title: "Weekly reminder", active: true, schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles" }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 } } });
  assert.equal(workshopPluginDeclaration.status, "ready");
  assert.deepEqual(requests.slice(1).map((request) => [request.method, request.path]), [["GET", "/api/v1/snapshot"], ["PATCH", "/api/v1/pulses/weekly%2Freminder"], ["DELETE", "/api/v1/pulses/weekly%2Freminder"]]);
});

test("service operations reject non-success responses instead of reporting false saves", async () => {
  const service = createPulseService(async () => ({ status: 409, body: { error: "A reminder with that id already exists." } }));
  await assert.rejects(service.create({ id: "duplicate" }), /already exists/);
});

test("plugin uses both generic host commands with the fixed Pulse config file", async () => {
  const calls = [];
  const requester = await createWorkshopSecureServiceRequester("/private/pulse", async (command, args) => { calls.push({ command, args }); return { status: 200, body: {} }; });
  await requester({ method: "GET", path: "/api/v1/snapshot" });
  assert.deepEqual(calls, [
    { command: "read_secure_service_metadata", args: { workspaceRoot: "/private/pulse", configFile: "pulse.config.json" } },
    { command: "request_configured_secure_service", args: { workspaceRoot: "/private/pulse", configFile: "pulse.config.json", request: { method: "GET", path: "/api/v1/snapshot" } } },
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /token|authorization|secret/i);
});

test("public UI fixture provides active, paused, and occurrence-state coverage without private data", () => {
  const root = new URL("../", import.meta.url).pathname;
  const config = readFileSync(join(root, "plugin/fixtures/ui-demo/pulses.yaml"), "utf8");
  const state = JSON.parse(readFileSync(join(root, "plugin/fixtures/ui-demo/state.json"), "utf8"));

  assert.match(config, /id: water-plants/);
  assert.match(config, /id: submit-timesheet/);
  assert.match(config, /active: false/);
  assert.deepEqual(state.occurrences.map((occurrence) => occurrence.state).sort(), ["done", "due", "scheduled"]);
  assert.doesNotMatch(`${config}\n${JSON.stringify(state)}`, /mounjaro|lindsay|token|this_is_my_new_app_called_pulse_by_guppi/i);
});

test("public setup docs explain the generic Workshop connection without publishing a credential", () => {
  const guide = readFileSync("docs/private-config.md", "utf8");
  const integration = readFileSync("docs/workshop-secure-service-capability.md", "utf8");
  assert.match(guide, /pulse\.config\.json/);
  assert.match(guide, /credentialRef/);
  assert.match(guide, /Keychain/);
  assert.match(guide, /Connect Pulse/);
  assert.doesNotMatch(guide, /PULSE_API_TOKEN=[^\n]+/);
  assert.match(integration, /progressive enhancement/i);
  assert.match(integration, /--workshop-canvas/);
  assert.match(integration, /standalone fallback/i);
  assert.match(integration, /changes Pulse\s+immediately/i);
  assert.match(integration, /real browser/i);
  assert.doesNotMatch(integration, /data-theme|palette(?:Id|-id)|preset(?:Id|-id)/);
});

test("a clean consumer can install the Git package and run the plugin prepare build", () => {
  const root = new URL("../", import.meta.url).pathname;
  const temp = mkdtempSync(join(tmpdir(), "pulse-clean-consumer-"));
  const source = join(temp, "pulse");
  const consumer = join(temp, "consumer");

  try {
    cpSync(root, source, {
      recursive: true,
      filter: (path) => ![
        ".env",
        ".git",
        "backups",
        "data",
        "dist",
        "logs",
        "node_modules",
        "pulses.yaml",
        "state",
      ].includes(basename(path)),
    });
    execFileSync("git", ["init", "--quiet"], { cwd: source });
    execFileSync("git", ["config", "user.email", "pulse-test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "Pulse test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "--quiet", "-m", "clean package"], { cwd: source });

    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), '{"private":true}\n');
    execFileSync("npm", ["install", `git+file://${source}`], {
      cwd: consumer,
      env: { ...process.env, npm_config_cache: join(temp, "npm-cache") },
      stdio: "pipe",
      timeout: 120_000,
    });

    assert.ok(existsSync(join(consumer, "node_modules/@marketing-builds/pulse/plugin/dist/index.js")));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
