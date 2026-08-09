import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { createPulseService, createWorkshopSecureServiceRequester, parsePulsePrivateConfig, pulseDefinitionFromForm, workshopPluginDeclaration } from "../plugin/dist/index.js";

const source = readFileSync("plugin/src/index.tsx", "utf8");
const service = readFileSync("plugin/src/service.ts", "utf8");
const definition = readFileSync("plugin/src/definition.ts", "utf8");
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
  assert.match(source, /useEffect\(\(\) => \{ void refresh\(\); \}, \[refresh\]\)/);
  assert.doesNotMatch(source, /workshop\/|\.\.\/workshop|@workshop/);
  assert.match(service, /pulsePath\("\/api\/v1\/snapshot"\)/);
  assert.doesNotMatch(service, /authorization|token|fetch\(/i);
  assert.match(definition, /Enter a reminder name/);
  assert.match(definition, /repeatEveryMinutes/);
});

test("built plugin validates private metadata and never puts credentials in service requests", async () => {
  assert.deepEqual(parsePulsePrivateConfig({ version: 1, endpoint: "https://pulse.example", credentialRef: "pulse-api-token" }), { version: 1, endpoint: "https://pulse.example", credentialRef: "pulse-api-token" });
  assert.throws(() => parsePulsePrivateConfig({ version: 1, endpoint: "http://pulse.example", credentialRef: "x" }), /HTTPS/);
  assert.throws(() => parsePulsePrivateConfig({ version: 1, endpoint: "https://pulse.example/api", credentialRef: "x" }), /origin/);
  const requests = [];
  const service = createPulseService(async (request) => { requests.push(request); return { status: 200, body: {} }; });
  await service.create(pulseDefinitionFromForm({ title: "Weekly reminder", day: "sunday", time: "09:30", repeat: "60", timezone: "America/Los_Angeles" }));
  await service.snapshot();
  await service.update("weekly/reminder", { active: false });
  await service.remove("weekly/reminder");
  assert.deepEqual(requests[0], { method: "POST", path: "/api/v1/pulses", body: { id: "weekly-reminder", title: "Weekly reminder", active: true, schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles" }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 60, snoozeEveryMinutes: 30 } } });
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
  assert.match(guide, /pulse\.config\.json/);
  assert.match(guide, /credentialRef/);
  assert.match(guide, /Keychain/);
  assert.match(guide, /Connect Pulse/);
  assert.doesNotMatch(guide, /PULSE_API_TOKEN=[^\n]+/);
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
      stdio: "pipe",
      timeout: 120_000,
    });

    assert.ok(existsSync(join(consumer, "node_modules/@marketing-builds/pulse/plugin/dist/index.js")));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
