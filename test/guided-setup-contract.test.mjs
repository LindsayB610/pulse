import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const decisionUrl = new URL("../docs/guided-byo-setup-g0.md", import.meta.url);
const fixturesUrl = new URL("./fixtures/guided-setup/contracts-v1.json", import.meta.url);

test("G0 records verified provider behavior and rejects template-time secret entry", async () => {
  const decision = await readFile(decisionUrl, "utf8");

  for (const source of [
    "https://docs.netlify.com/deploy/create-deploys/",
    "https://docs.netlify.com/build/environment-variables/overview/",
    "https://docs.netlify.com/build/data-and-storage/netlify-blobs/",
    "https://docs.ntfy.sh/config/",
    "https://docs.ntfy.sh/subscribe/phone/",
    "https://docs.ntfy.sh/publish/",
  ]) {
    assert.match(decision, new RegExp(source.replaceAll("/", "\\/")));
  }

  assert.match(decision, /template-time ntfy token[^\n]+rejected/i);
  assert.match(decision, /runner-owned secure setup page/i);
  assert.match(decision, /encrypted at rest and in transit/i);
  assert.match(decision, /Pulse webview[^\n]+never observes/i);
  assert.match(decision, /Workshop[^\n]+never observes/i);
  assert.match(decision, /build[^\n]+never observes/i);
});

test("G0 freezes provider-neutral setup contracts and two conforming adapters", async () => {
  const fixtures = JSON.parse(await readFile(fixturesUrl, "utf8"));

  assert.equal(fixtures.schemaVersion, "pulse.guided-setup.fixture.v1");
  assert.equal(fixtures.runnerProtocol.manifest.service, "pulse-runner");
  assert.equal(fixtures.runnerProtocol.manifest.apiVersion, "pulse.service.v1");
  assert.equal(fixtures.runnerProtocol.manifest.setupVersion, "pulse.setup.v1");
  assert.deepEqual(fixtures.runnerProtocol.manifest.capabilities, [
    "pairing",
    "per-client-credentials",
    "notification-secret-capture",
    "test-notification",
    "health",
    "export",
    "delete",
  ]);

  assert.deepEqual(
    fixtures.adapters.map((adapter) => adapter.id),
    ["netlify", "northstar-cloud"],
  );
  for (const adapter of fixtures.adapters) {
    assert.equal(adapter.contractVersion, "pulse.runner-adapter.v1");
    assert.equal(adapter.quickSetup, true);
    assert.equal(adapter.secretCapture.mode, "runner-hosted-browser");
    assert.equal(adapter.secretCapture.entersPulse, false);
    assert.equal(adapter.secretCapture.entersWorkshop, false);
    assert.equal(adapter.lifecycle.manage, true);
    assert.equal(adapter.lifecycle.export, true);
    assert.equal(adapter.lifecycle.delete, true);
  }

  assert.equal(fixtures.adapters[0].provider, "Netlify");
  assert.equal(fixtures.adapters[1].provider, "Northstar Cloud (fictional)");
  assert.doesNotMatch(JSON.stringify(fixtures.coreStateMachine), /netlify|northstar/i);
});

test("G0 secret flow and attack transcripts fail closed", async () => {
  const fixtures = JSON.parse(await readFile(fixturesUrl, "utf8"));
  const ntfyToken = fixtures.secretFlow.values.find(
    (value) => value.id === "notification-provider-token",
  );

  assert.deepEqual(ntfyToken.allowedObservers, [
    "user",
    "notification-provider",
    "user-browser-on-runner-origin",
    "runner-production-runtime",
    "runner-provider-encrypted-storage",
  ]);
  for (const forbidden of [
    "pulse-webview",
    "workshop-javascript",
    "workshop-local-state",
    "deploy-url",
    "template-form",
    "build-runtime",
    "repository",
    "logs",
  ]) {
    assert.ok(ntfyToken.forbiddenObservers.includes(forbidden), `${forbidden} is explicitly forbidden`);
  }

  const attacks = new Map(fixtures.pairingTranscripts.map((fixture) => [fixture.id, fixture.expected]));
  assert.equal(attacks.get("valid-origin-bound-proof"), "accept");
  for (const id of [
    "wrong-origin",
    "wrong-fingerprint",
    "api-downgrade",
    "redirect",
    "replay",
    "challenge-relay",
  ]) {
    assert.equal(attacks.get(id), "reject", `${id} is rejected`);
  }
});

test("G0 preserves the current journey and legacy migration contract", async () => {
  const fixtures = JSON.parse(await readFile(fixturesUrl, "utf8"));

  assert.ok(fixtures.currentJourney.steps.length >= 10);
  assert.equal(fixtures.currentJourney.requiresTerminal, true);
  assert.equal(fixtures.currentJourney.requiresHandwrittenConfig, true);
  assert.equal(fixtures.migration.legacyAuth, "single-environment-api-token");
  assert.equal(fixtures.migration.remindersPreserved, true);
  assert.equal(fixtures.migration.historyPreserved, true);
  assert.equal(fixtures.migration.rollbackOnFailure, true);

  const artifact = JSON.stringify(fixtures);
  assert.doesNotMatch(
    artifact,
    /this_is_my_new_app_called_pulse_by_guppi|lindsayb82|mounjaro|lindsaybrunner|authorization:\s*bearer/i,
  );
});
