import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";

import {
  authenticateRunnerClient,
  bootstrapRunnerSetup,
  createAdditionalDeviceCode,
  createRunnerPairingChallenge,
  createRunnerSecretSetupSession,
  displayPublicKeyFingerprint,
  pairingProofPayload,
  pairAdditionalRunnerClient,
  pairFirstRunnerClient,
  parseRunnerSetupState,
  consumeRunnerSecretSetupSession,
  readRunnerManifest,
  revokeRunnerClient,
  type RunnerSetupState,
} from "../src/setup.ts";

const crypto = webcrypto as unknown as Crypto;
const encoder = new TextEncoder();
const now = new Date("2026-08-16T18:00:00.000Z");
const later = (seconds: number) => new Date(now.getTime() + seconds * 1_000);

async function keypair(): Promise<{ privateKey: CryptoKey; publicKey: string; fingerprint: string }> {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey)).toString("base64url");
  return {
    privateKey: keys.privateKey,
    publicKey,
    fingerprint: await displayPublicKeyFingerprint(publicKey),
  };
}

async function signedFirstPair(
  state: RunnerSetupState,
  privateKey: CryptoKey,
  input: { challengeId: string; installationId?: string; origin?: string; apiVersion?: string },
) {
  const installationId = input.installationId ?? "mac-studio-demo";
  const origin = input.origin ?? "https://pulse-sparrow-demo.example";
  const apiVersion = input.apiVersion ?? "pulse.service.v1";
  const challenge = state.challenges.find((candidate) => candidate.id === input.challengeId);
  assert.ok(challenge);
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "Ed25519",
      privateKey,
      encoder.encode(
        pairingProofPayload({
          apiVersion,
          challengeId: challenge.id,
          fingerprint: state.deployedPublicKeyFingerprint,
          installationId,
          nonce: challenge.nonce,
          origin,
        }),
      ),
    ),
  ).toString("base64url");
  return { apiVersion, challengeId: challenge.id, installationId, origin, signature };
}

test("G2 bootstrap is idempotent and the manifest exposes bounded public setup metadata", async () => {
  const keys = await keypair();
  const state = await bootstrapRunnerSetup(null, {
    canonicalOrigin: "https://pulse-sparrow-demo.example/",
    deployedPublicKey: keys.publicKey,
    now,
  });
  const repeated = await bootstrapRunnerSetup(state, {
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    deployedPublicKey: keys.publicKey,
    now: later(10),
  });

  assert.deepEqual(repeated, state);
  assert.deepEqual(readRunnerManifest(state), {
    service: "pulse-runner",
    apiVersion: "pulse.service.v1",
    setupVersion: "pulse.setup.v1",
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    setupState: "awaiting-pairing",
    deployedPublicKeyFingerprint: keys.fingerprint,
    capabilities: [
      "pairing",
      "per-client-credentials",
      "notification-secret-capture",
      "test-notification",
      "health",
      "export",
      "delete",
    ],
  });
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE KEY|credential/i);

  await assert.rejects(
    bootstrapRunnerSetup(state, {
      canonicalOrigin: "https://other.example",
      deployedPublicKey: keys.publicKey,
      now,
    }),
    /does not match/i,
  );
  for (const unsafeOrigin of ["http://pulse.example", "https://localhost", "https://127.0.0.1", "https://[::1]"]) {
    await assert.rejects(
      bootstrapRunnerSetup(null, { canonicalOrigin: unsafeOrigin, deployedPublicKey: keys.publicKey, now }),
      /public HTTPS origin/i,
    );
  }
});

test("G2 first pairing verifies origin-bound proof, stores only a verifier, and rejects replay", async () => {
  const keys = await keypair();
  const state = await bootstrapRunnerSetup(null, {
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    deployedPublicKey: keys.publicKey,
    now,
  });
  const challenge = createRunnerPairingChallenge(state, { installationId: "mac-studio-demo", now });
  const proof = await signedFirstPair(state, keys.privateKey, { challengeId: challenge.id });
  const result = await pairFirstRunnerClient(state, proof, { now: later(1) });

  assert.equal(result.client.installationId, "mac-studio-demo");
  assert.match(result.credential, /^pulse_client_/);
  assert.equal(state.bootstrapRetiredAt, later(1).toISOString());
  assert.equal(state.challenges[0]?.consumedAt, later(1).toISOString());
  assert.equal(state.clients[0]?.credentialVerifier.length, 64);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(result.credential));
  assert.equal(await authenticateRunnerClient(state, result.credential, later(2)), result.client.id);
  await assert.rejects(pairFirstRunnerClient(state, proof, { now: later(2) }), /already used|retired/i);
});

test("G2 pairing rejects expired, substituted, downgraded, and invalid proofs without issuing credentials", async () => {
  for (const mutation of ["expired", "origin", "installation", "version", "signature"] as const) {
    const keys = await keypair();
    const state = await bootstrapRunnerSetup(null, {
      canonicalOrigin: "https://pulse-sparrow-demo.example",
      deployedPublicKey: keys.publicKey,
      now,
    });
    const challenge = createRunnerPairingChallenge(state, { installationId: "mac-studio-demo", now });
    const proof = await signedFirstPair(state, keys.privateKey, { challengeId: challenge.id });
    if (mutation === "origin") proof.origin = "https://relay.example";
    if (mutation === "installation") proof.installationId = "attacker-mac";
    if (mutation === "version") proof.apiVersion = "pulse.service.v0";
    if (mutation === "signature") proof.signature = Buffer.alloc(64, 7).toString("base64url");
    await assert.rejects(
      pairFirstRunnerClient(state, proof, { now: mutation === "expired" ? later(121) : later(1) }),
      /invalid|expired|match|version/i,
      mutation,
    );
    assert.equal(state.clients.length, 0, mutation);
    assert.equal(state.bootstrapRetiredAt, null, mutation);
  }
});

test("G2 additional-device codes are hashed, expiring, single-use, origin-bound, and revocable", async () => {
  const keys = await keypair();
  const state = await bootstrapRunnerSetup(null, {
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    deployedPublicKey: keys.publicKey,
    now,
  });
  const challenge = createRunnerPairingChallenge(state, { installationId: "first-mac", now });
  const proof = await signedFirstPair(state, keys.privateKey, {
    challengeId: challenge.id,
    installationId: "first-mac",
  });
  const first = await pairFirstRunnerClient(state, proof, { now: later(1) });
  const invitation = await createAdditionalDeviceCode(state, first.credential, {
    installationId: "second-mac",
    origin: "https://pulse-sparrow-demo.example",
    now: later(2),
  });

  assert.match(invitation.code, /^PULSE-/);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(invitation.code));
  const second = await pairAdditionalRunnerClient(
    state,
    { code: invitation.code, installationId: "second-mac", origin: "https://pulse-sparrow-demo.example" },
    { now: later(3) },
  );
  assert.equal(await authenticateRunnerClient(state, second.credential, later(4)), second.client.id);
  await assert.rejects(
    pairAdditionalRunnerClient(
      state,
      { code: invitation.code, installationId: "third-mac", origin: "https://pulse-sparrow-demo.example" },
      { now: later(4) },
    ),
    /invalid or expired/i,
  );

  await revokeRunnerClient(state, first.credential, second.client.id, later(5));
  await assert.rejects(authenticateRunnerClient(state, second.credential, later(6)), /unauthorized/i);

  const expiring = await createAdditionalDeviceCode(state, first.credential, {
    installationId: "late-mac",
    origin: "https://pulse-sparrow-demo.example",
    now: later(7),
  });
  await assert.rejects(
    pairAdditionalRunnerClient(
      state,
      { code: expiring.code, installationId: "late-mac", origin: "https://pulse-sparrow-demo.example" },
      { now: later(608) },
    ),
    /invalid or expired/i,
  );
});

test("G2 shared setup state rate-limits challenge creation and proof guessing", async () => {
  const keys = await keypair();
  const state = await bootstrapRunnerSetup(null, {
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    deployedPublicKey: keys.publicKey,
    now,
  });
  for (let index = 0; index < 10; index += 1) {
    createRunnerPairingChallenge(state, { installationId: `mac-${index}`, now });
  }
  assert.throws(
    () => createRunnerPairingChallenge(state, { installationId: "mac-eleven", now }),
    /too many pairing attempts/i,
  );

  const challenge = state.challenges[0];
  assert.ok(challenge);
  const proof = await signedFirstPair(state, keys.privateKey, {
    challengeId: challenge.id,
    installationId: challenge.installationId,
  });
  proof.signature = Buffer.alloc(64, 7).toString("base64url");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(pairFirstRunnerClient(state, proof, { now: later(1) }), /invalid/i);
  }
  await assert.rejects(pairFirstRunnerClient(state, proof, { now: later(1) }), /invalid/i);
  assert.equal(challenge.failedAttempts, 5);
});

test("G2 persisted setup state migrates additive fields and rejects corrupt or secret-bearing records", async () => {
  const keys = await keypair();
  const state = await bootstrapRunnerSetup(null, {
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    deployedPublicKey: keys.publicKey,
    now,
  });
  const partial = structuredClone(state) as unknown as Record<string, unknown>;
  delete partial.testDeliveries;

  assert.deepEqual(parseRunnerSetupState(partial), state);
  assert.deepEqual(
    await bootstrapRunnerSetup(partial, {
      canonicalOrigin: "https://pulse-sparrow-demo.example",
      deployedPublicKey: keys.publicKey,
      now: later(1),
    }),
    state,
  );

  for (const corrupt of [
    { ...state, schemaVersion: "pulse.runner-setup.v0" },
    { ...state, canonicalOrigin: "http://localhost" },
    { ...state, clients: [{ credential: "raw-secret" }] },
    { ...state, challenges: "not-an-array" },
    { ...state, createdAt: "not-a-date" },
  ]) {
    assert.throws(() => parseRunnerSetupState(corrupt), /setup state is invalid/i);
  }
});

test("G3 runner-owned secret sessions are authenticated, hashed, expiring, origin-bound, and single-use", async () => {
  const keys = await keypair();
  const state = await bootstrapRunnerSetup(null, {
    canonicalOrigin: "https://pulse-sparrow-demo.example",
    deployedPublicKey: keys.publicKey,
    now,
  });
  const challenge = createRunnerPairingChallenge(state, { installationId: "first-mac", now });
  const proof = await signedFirstPair(state, keys.privateKey, { challengeId: challenge.id, installationId: "first-mac" });
  const paired = await pairFirstRunnerClient(state, proof, { now: later(1) });
  const session = await createRunnerSecretSetupSession(state, paired.credential, later(2));

  assert.match(session.capability, /^pulse_setup_/);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(session.capability));
  assert.equal(
    await consumeRunnerSecretSetupSession(state, {
      sessionId: session.sessionId,
      capability: session.capability,
      origin: state.canonicalOrigin,
      now: later(3),
    }),
    paired.client.id,
  );
  await assert.rejects(
    consumeRunnerSecretSetupSession(state, {
      sessionId: session.sessionId,
      capability: session.capability,
      origin: state.canonicalOrigin,
      now: later(4),
    }),
    /invalid or expired/i,
  );

  const expired = await createRunnerSecretSetupSession(state, paired.credential, later(5));
  await assert.rejects(
    consumeRunnerSecretSetupSession(state, {
      sessionId: expired.sessionId,
      capability: expired.capability,
      origin: state.canonicalOrigin,
      now: later(606),
    }),
    /invalid or expired/i,
  );
  const wrongOrigin = await createRunnerSecretSetupSession(state, paired.credential, later(7));
  await assert.rejects(
    consumeRunnerSecretSetupSession(state, {
      sessionId: wrongOrigin.sessionId,
      capability: wrongOrigin.capability,
      origin: "https://attacker.example",
      now: later(8),
    }),
    /origin/i,
  );
});
