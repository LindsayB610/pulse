import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.deepEqual(requests[0], { method: "POST", path: "/api/v1/pulses", body: { id: "weekly-reminder", title: "Weekly reminder", active: true, schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles" }, notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 60 } } });
  assert.equal(workshopPluginDeclaration.status, "ready");
  assert.deepEqual(requests.slice(1).map((request) => [request.method, request.path]), [["GET", "/api/v1/snapshot"], ["PATCH", "/api/v1/pulses/weekly%2Freminder"], ["DELETE", "/api/v1/pulses/weekly%2Freminder"]]);
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
