import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertDeploymentAdapter,
  createDeploymentHandoff,
  createNetlifyDeploymentAdapter,
  type DeploymentAdapter,
} from "../src/deployment-adapters.ts";

const input = {
  setupPublicKey: "MCowBQYDK2VwAyEAFICTIONALPUBLICKEY",
  suggestedTopic: "pulse_fixture_topic_4e5c9be5d99347d8a4394e2c",
  notificationServer: "https://notify.example",
  returnUrl: "workshop://secure-service/return/setup_fixture_01",
};

const fictionalAdapter: DeploymentAdapter = {
  schemaVersion: "pulse.deployment-adapter.v1",
  id: "northstar-cloud",
  label: "Northstar Cloud",
  supportLevel: "guided",
  capabilities: {
    create: true,
    return: true,
    manage: true,
    repair: true,
    update: true,
    export: true,
    delete: true,
  },
  handoff: {
    mode: "browser-template",
    baseUrl: "https://console.northstar.example/templates/pulse",
    publicFragmentFields: {
      setupPublicKey: "setup_key",
      suggestedTopic: "topic",
      notificationServer: "notify_server",
      returnUrl: "return_to",
    },
  },
  dashboardUrl: "https://console.northstar.example/projects",
  documentationUrl: "https://docs.northstar.example/pulse",
};

test("G3 deployment adapters share one provider-neutral versioned contract", () => {
  for (const adapter of [fictionalAdapter, createNetlifyDeploymentAdapter()]) {
    assert.doesNotThrow(() => assertDeploymentAdapter(adapter));
    assert.deepEqual(Object.keys(adapter.capabilities).sort(), [
      "create", "delete", "export", "manage", "repair", "return", "update",
    ]);
    const handoff = createDeploymentHandoff(adapter, input);
    const url = new URL(handoff.url);
    assert.equal(url.protocol, "https:");
    assert.doesNotMatch(url.search, /setup|topic|notify|return|token|credential|secret/i);
    assert.ok(url.hash.length > 1);
    assert.doesNotMatch(handoff.url, /token|credential|secret/i);
    assert.equal(handoff.adapterId, adapter.id);
  }
});

test("G3 Netlify handoff contains only public setup material in its fragment", () => {
  const adapter = createNetlifyDeploymentAdapter();
  const handoff = createDeploymentHandoff(adapter, input);
  const url = new URL(handoff.url);
  assert.equal(url.origin, "https://app.netlify.com");
  assert.equal(url.pathname, "/start/deploy");
  assert.equal(url.searchParams.get("repository"), "https://github.com/LindsayB610/pulse");
  const fragment = new URLSearchParams(url.hash.slice(1));
  assert.deepEqual([...fragment.keys()].sort(), [
    "PULSE_NTFY_SERVER",
    "PULSE_NTFY_TOPIC",
    "PULSE_SETUP_PUBLIC_KEY",
    "PULSE_SETUP_RETURN_URL",
  ]);
  assert.equal(fragment.get("PULSE_NTFY_TOPIC"), input.suggestedTopic);
});

test("G3 malformed adapters and unsafe handoffs fail closed", () => {
  assert.throws(
    () => assertDeploymentAdapter({ ...fictionalAdapter, id: "Netlify Special!" }),
    /adapter/i,
  );
  assert.throws(
    () => createDeploymentHandoff(
      { ...fictionalAdapter, handoff: { ...fictionalAdapter.handoff, baseUrl: "http://localhost:8888" } },
      input,
    ),
    /public HTTPS/i,
  );
  assert.throws(
    () => createDeploymentHandoff(fictionalAdapter, { ...input, suggestedTopic: "bad topic" }),
    /topic/i,
  );
});
