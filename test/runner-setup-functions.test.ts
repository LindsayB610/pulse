import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";

import challengeHandler from "../netlify/functions/pulse-setup-challenge.ts";
import clientsHandler from "../netlify/functions/pulse-setup-clients.ts";
import clientHandler from "../netlify/functions/pulse-setup-client.ts";
import additionalPairHandler from "../netlify/functions/pulse-setup-additional-pair.ts";
import manifestHandler, { config as manifestConfig } from "../netlify/functions/pulse-setup-manifest.ts";
import pairHandler from "../netlify/functions/pulse-setup-pair.ts";
import testNotificationHandler from "../netlify/functions/pulse-setup-test-notification.ts";
import notificationSessionHandler from "../netlify/functions/pulse-setup-notification-session.ts";
import notificationExchangeHandler from "../netlify/functions/pulse-setup-notification-exchange.ts";
import notificationSecretHandler from "../netlify/functions/pulse-setup-notification-secret.ts";
import notificationPageHandler from "../netlify/functions/pulse-setup-notification-page.ts";
import setupStatusHandler from "../netlify/functions/pulse-setup-status.ts";
import pulsesHandler from "../netlify/functions/pulse-pulses.ts";
import snapshotHandler from "../netlify/functions/pulse-snapshot.ts";
import { setPulseBlobStoreForTest, type PulseBlobStore } from "../netlify/functions/_shared/pulse.ts";
import { pairingProofPayload } from "../src/setup.ts";

const crypto = webcrypto as unknown as Crypto;
const encoder = new TextEncoder();

class MemoryBlobStore implements PulseBlobStore {
  private entries = new Map<string, { data: unknown; etag: string }>();
  private revision = 0;
  async get(key: string): Promise<unknown> { return this.entries.get(key)?.data ?? null; }
  async getWithMetadata(key: string): Promise<{ data: unknown; etag?: string } | null> {
    const entry = this.entries.get(key);
    return entry ? structuredClone(entry) : null;
  }
  async setJSON(key: string, value: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string }): Promise<{ modified: boolean }> {
    const current = this.entries.get(key);
    if (options.onlyIfNew === true && current !== undefined) return { modified: false };
    if (options.onlyIfMatch !== undefined && current?.etag !== options.onlyIfMatch) return { modified: false };
    this.entries.set(key, { data: structuredClone(value), etag: `etag-${++this.revision}` });
    return { modified: true };
  }
  async delete(key: string): Promise<void> { this.entries.delete(key); }
  serialized(): string { return JSON.stringify([...this.entries.entries()]); }
}

test("G2 Netlify setup endpoints persist pairing atomically, retain legacy auth, and keep tests isolated", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey)).toString("base64url");
  const store = new MemoryBlobStore();
  const before = { ...process.env };
  Object.assign(process.env, {
    CONTEXT: "production",
    PULSE_PUBLIC_BASE_URL: "https://pulse-sparrow-demo.example",
    PULSE_SETUP_PUBLIC_KEY: publicKey,
    PULSE_API_TOKEN: "legacy-api-token-with-at-least-32-characters",
    PULSE_NOTIFY_PROVIDER: "ntfy",
    PULSE_NTFY_SERVER: "https://ntfy.test",
    PULSE_NTFY_TOPIC: "fictional-private-topic",
  });
  setPulseBlobStoreForTest(store);
  const originalFetch = globalThis.fetch;
  const deliveries: Array<{ url: string; title: string; actions: string; authorization: string }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    deliveries.push({
      url: String(url),
      title: String((init?.headers as Record<string, string>)?.title ?? ""),
      actions: String((init?.headers as Record<string, string>)?.actions ?? ""),
      authorization: String((init?.headers as Record<string, string>)?.authorization ?? ""),
    });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  try {
    const manifestResponse = await manifestHandler(new Request("https://pulse-sparrow-demo.example/api/setup/manifest"));
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.setupState, "awaiting-pairing");
    assert.equal(manifestConfig.path, "/api/setup/manifest");

    const challengeResponse = await challengeHandler(new Request("https://pulse-sparrow-demo.example/api/setup/challenge", {
      method: "POST",
      body: JSON.stringify({ installationId: "first-mac" }),
    }));
    assert.equal(challengeResponse.status, 201);
    const challenge = await challengeResponse.json();
    const signature = Buffer.from(await crypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      encoder.encode(pairingProofPayload({
        apiVersion: manifest.apiVersion,
        challengeId: challenge.id,
        fingerprint: manifest.deployedPublicKeyFingerprint,
        installationId: "first-mac",
        nonce: challenge.nonce,
        origin: manifest.canonicalOrigin,
      })),
    )).toString("base64url");
    const proof = {
      apiVersion: manifest.apiVersion,
      challengeId: challenge.id,
      installationId: "first-mac",
      origin: manifest.canonicalOrigin,
      signature,
    };
    const pairRequest = () => new Request("https://pulse-sparrow-demo.example/api/setup/pair", {
      method: "POST",
      body: JSON.stringify(proof),
    });
    const concurrentPairs = await Promise.all([pairHandler(pairRequest()), pairHandler(pairRequest())]);
    assert.deepEqual(concurrentPairs.map((response) => response.status).sort(), [201, 401]);
    const pairResponse = concurrentPairs.find((response) => response.status === 201);
    assert.ok(pairResponse);
    const paired = await pairResponse.json();
    assert.match(paired.credential, /^pulse_client_/);
    assert.equal((await pairHandler(pairRequest())).status, 401);
    const createReminder = await pulsesHandler(new Request("https://pulse-sparrow-demo.example/api/v1/pulses", {
      method: "POST",
      headers: { authorization: `Bearer ${paired.credential}` },
      body: JSON.stringify({
        id: "fixture-reminder", title: "Fixture reminder", active: true,
        schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles" },
        notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
      }),
    }));
    assert.equal(createReminder.status, 201, "the paired per-Mac credential authorizes the actual reminder API");
    const managedSnapshot = await snapshotHandler(new Request("https://pulse-sparrow-demo.example/api/v1/snapshot", {
      headers: { authorization: `Bearer ${paired.credential}` },
    }));
    assert.equal(managedSnapshot.status, 200);
    assert.deepEqual((await managedSnapshot.json()).pulses.map((pulse: { id: string }) => pulse.id), ["fixture-reminder"]);
    const setupStatusRequest = () => new Request("https://pulse-sparrow-demo.example/api/setup/status", {
      headers: { authorization: `Bearer ${paired.credential}` },
    });
    assert.deepEqual(await (await setupStatusHandler(setupStatusRequest())).json(), {
      connected: true,
      notificationConfigured: false,
    });
    process.env.PULSE_NTFY_TOKEN = "legacy-notification-token-for-migration";
    assert.deepEqual(await (await setupStatusHandler(setupStatusRequest())).json(), {
      connected: true,
      notificationConfigured: true,
    }, "an existing environment token remains valid during safe migration");
    delete process.env.PULSE_NTFY_TOKEN;

    const setupPage = await notificationPageHandler();
    assert.equal(setupPage.status, 200);
    assert.equal(setupPage.headers.get("cache-control"), "no-store");
    assert.match(await setupPage.text(), /Save ntfy access/);
    const sessionResponse = await notificationSessionHandler(new Request(
      "https://pulse-sparrow-demo.example/api/setup/notification-session",
      { method: "POST", headers: { authorization: `Bearer ${paired.credential}` } },
    ));
    assert.equal(sessionResponse.status, 201);
    const session = await sessionResponse.json();
    const sessionUrl = new URL(session.url);
    assert.equal(sessionUrl.search, "");
    const sessionFragment = new URLSearchParams(sessionUrl.hash.slice(1));
    const notificationToken = "tk_fixture_private_notification_access";
    const exchange = await notificationExchangeHandler(new Request(
      "https://pulse-sparrow-demo.example/api/setup/notification-exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: manifest.canonicalOrigin },
        body: JSON.stringify({
          sessionId: sessionFragment.get("session"),
          capability: sessionFragment.get("capability"),
        }),
      },
    ));
    assert.equal(exchange.status, 204);
    const setupCookie = exchange.headers.get("set-cookie") ?? "";
    assert.match(setupCookie, /^pulse_setup=.*HttpOnly; SameSite=Strict$/);
    const cookieValue = setupCookie.split(";", 1)[0];
    const saveSecret = () => notificationSecretHandler(new Request(
      "https://pulse-sparrow-demo.example/api/setup/notification-secret",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: manifest.canonicalOrigin, cookie: cookieValue },
        body: JSON.stringify({ token: notificationToken }),
      },
    ));
    const saved = await saveSecret();
    assert.equal(saved.status, 204);
    assert.equal(await saved.text(), "", "the runner never echoes notification credentials");
    assert.equal((await saveSecret()).status, 401, "the browser setup session is single-use");
    assert.deepEqual(await (await setupStatusHandler(setupStatusRequest())).json(), {
      connected: true,
      notificationConfigured: true,
    });
    const rejectedOrigin = await notificationExchangeHandler(new Request(
      "https://pulse-sparrow-demo.example/api/setup/notification-exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: JSON.stringify({ sessionId: sessionFragment.get("session"), capability: sessionFragment.get("capability") }),
      },
    ));
    assert.equal(rejectedOrigin.status, 401);
    const authorized = (url: string, credential: string, body?: unknown) => new Request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${credential}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const invitationResponse = await clientsHandler(authorized(
      "https://pulse-sparrow-demo.example/api/setup/clients",
      paired.credential,
      { installationId: "second-mac" },
    ));
    assert.equal(invitationResponse.status, 201);
    const invitation = await invitationResponse.json();
    const secondPairResponse = await additionalPairHandler(new Request(
      "https://pulse-sparrow-demo.example/api/setup/additional-pair",
      { method: "POST", body: JSON.stringify({ code: invitation.code, installationId: "second-mac", origin: manifest.canonicalOrigin }) },
    ));
    assert.equal(secondPairResponse.status, 201);
    const second = await secondPairResponse.json();

    const clients = await clientsHandler(new Request("https://pulse-sparrow-demo.example/api/setup/clients", {
      headers: { authorization: `Bearer ${paired.credential}` },
    }));
    assert.equal(clients.status, 200);
    assert.equal((await clients.json()).clients.length, 2);
    const revoked = await clientHandler(new Request(
      `https://pulse-sparrow-demo.example/api/setup/clients/${second.client.id}`,
      { method: "DELETE", headers: { authorization: `Bearer ${paired.credential}` } },
    ), { params: { id: second.client.id } } as never);
    assert.equal(revoked.status, 200);

    const testRequest = () => authorized(
      "https://pulse-sparrow-demo.example/api/setup/test-notification",
      paired.credential,
      { idempotencyKey: "setup-test-1" },
    );
    assert.equal((await testNotificationHandler(testRequest())).status, 202);
    assert.equal((await testNotificationHandler(testRequest())).status, 200);
    assert.equal(deliveries.length, 1, "idempotent retries emit only one setup notification");
    assert.equal(deliveries[0]?.title, "Pulse setup test");
    assert.equal(deliveries[0]?.actions, "", "setup proof cannot create occurrence actions");
    assert.equal(deliveries[0]?.authorization, `Bearer ${notificationToken}`);

    const legacy = await testNotificationHandler(authorized(
      "https://pulse-sparrow-demo.example/api/setup/test-notification",
      process.env.PULSE_API_TOKEN,
      { idempotencyKey: "legacy-test" },
    ));
    assert.equal(legacy.status, 202, "legacy API token remains valid during migration");
    assert.equal(deliveries.length, 2);

    assert.doesNotMatch(store.serialized(), new RegExp(paired.credential));
    assert.doesNotMatch(store.serialized(), new RegExp(second.credential));
    assert.doesNotMatch(store.serialized(), new RegExp(invitation.code));
    assert.doesNotMatch(store.serialized(), /fictional-notification-token/);
    assert.doesNotMatch(store.serialized(), new RegExp(sessionFragment.get("capability") ?? "unmatchable"));
  } finally {
    setPulseBlobStoreForTest(undefined);
    globalThis.fetch = originalFetch;
    process.env = before;
  }
});
