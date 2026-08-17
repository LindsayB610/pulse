import { getStore } from "@netlify/blobs";

import { createNotificationDispatcherFromEnv } from "../../../src/adapters.js";
import { loadPulseDefinitionsFromYaml, parsePulseDefinitions, applyOccurrenceAction, canCompleteOccurrence, createPulseEvent, type PulseDefinition } from "../../../src/model.js";
import { isPulseNtfySequenceId } from "../../../src/ntfy-sequence.js";
import { reconcileUntouchedFutureOccurrences, runPulseRunnerTick } from "../../../src/runner.js";
import {
  authenticateRunnerClient,
  bootstrapRunnerSetup,
  consumeRunnerSecretSetupSession,
  createAdditionalDeviceCode,
  createRunnerPairingChallenge,
  createRunnerSecretSetupSession,
  pairAdditionalRunnerClient,
  pairFirstRunnerClient,
  readRunnerManifest,
  revokeRunnerClient,
  validateRunnerSecretSetupSession,
  type PublicRunnerClient,
  type RunnerPairingProof,
  type RunnerSetupState,
} from "../../../src/setup.js";
import { createEmptyPulseState, createMemoryPulseStateStore, type PulseState } from "../../../src/storage.js";

const stateKey = "state.json";
const lockKey = "state.lock";
const heartbeatKey = "runner-heartbeat.json";
const definitionsKey = "definitions.json";
const runnerSetupKey = "runner-setup.json";
const runnerSecretsKey = "runner-secrets.json";
const runnerDeliverySecretKey = "runner-delivery-secret.json";
const lockLeaseMs = 55_000;
const maximumSetupRequestBytes = 16_384;
const notificationSetupCookie = "pulse_setup";

type Lease = { owner: string; expiresAt: string };

/** The small Blob surface Pulse actually relies on. Keeping it explicit makes
 * the production adapter testable without ever pointing tests at real data. */
export type PulseBlobStore = {
  get: (key: string, options: { type: "json"; consistency: "strong" }) => Promise<unknown>;
  getWithMetadata: (key: string, options: { type: "json"; consistency: "strong" }) => Promise<{ data: unknown; etag?: string } | null>;
  setJSON: (key: string, value: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string }) => Promise<{ modified: boolean }>;
  delete: (key: string) => Promise<void>;
};

let testStore: PulseBlobStore | undefined;

/** Test-only injection point for the Netlify function contract suite. It is
 * intentionally not exported from the package surface or callable by clients. */
export function setPulseBlobStoreForTest(value: PulseBlobStore | undefined): void {
  testStore = value;
}

export async function runScheduledPulseTick(now: Date = new Date()): Promise<void> {
  await withPulseLock(async () => {
    const result = await withState(async (stateStore) => {
      const notificationToken = await notificationDeliveryToken();
      const pulses = await readPulseDefinitions();
      const env = {
        PULSE_NOTIFY_PROVIDER: requiredEnv("PULSE_NOTIFY_PROVIDER"),
        PULSE_NTFY_SERVER: requiredEnv("PULSE_NTFY_SERVER"),
        PULSE_NTFY_TOPIC: requiredEnv("PULSE_NTFY_TOPIC"),
        PULSE_NTFY_TOKEN: notificationToken,
      };
      return runPulseRunnerTick({
        now,
        pulses,
        stateStore,
        notifier: createNotificationDispatcherFromEnv(env, { doneActionUrl, snoozeActionUrl }),
        redactValues: [env.PULSE_NTFY_TOPIC, ...(env.PULSE_NTFY_TOKEN === undefined ? [] : [env.PULSE_NTFY_TOKEN])],
      });
    });
    await store().setJSON(heartbeatKey, { checkedAt: now.toISOString(), result }, { onlyIfNew: false });
  });
}

export async function readPulseSnapshot(): Promise<Record<string, unknown>> {
  const pulses = await readPulseDefinitions();
  const state = await readState();
  const heartbeat = await store().get(heartbeatKey, { type: "json", consistency: "strong" }) as { checkedAt?: string } | null;
  const checkedAt = heartbeat?.checkedAt ? new Date(heartbeat.checkedAt) : undefined;
  const staleAfterMs = 2 * 60_000;
  return {
    pulses,
    state,
    checkedAt: new Date().toISOString(),
    runnerHealth: {
      status: checkedAt === undefined ? "unknown" : Date.now() - checkedAt.getTime() > staleAfterMs ? "stale" : "running",
      checkedAt: checkedAt?.toISOString() ?? new Date().toISOString(),
    },
  };
}

export async function createPulseDefinition(input: unknown): Promise<PulseDefinition> {
  const [pulse] = parsePulseDefinitions([input]);
  return withPulseLock(async () => {
    const pulses = await readPulseDefinitions();
    if (pulses.some((candidate) => candidate.id === pulse.id)) throw new PulseHttpError(409, "A pulse with that id already exists.");
    await store().setJSON(definitionsKey, [...pulses, pulse], { onlyIfNew: false });
    return pulse;
  });
}

export async function updatePulseDefinition(id: string, input: unknown, now: Date = new Date()): Promise<PulseDefinition> {
  const [pulse] = parsePulseDefinitions([input]);
  if (pulse.id !== id) throw new PulseHttpError(400, "A pulse id cannot be changed.");
  return withPulseLock(async () => {
    const pulses = await readPulseDefinitions();
    const index = pulses.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new PulseHttpError(404, "Pulse not found.");
    pulses[index] = pulse;
    await store().setJSON(definitionsKey, pulses, { onlyIfNew: false });
    await withState((stateStore) => {
      const state = stateStore.read();
      reconcileUntouchedFutureOccurrences(state, [pulse], now);
      stateStore.write(state);
    });
    return pulse;
  });
}

export async function deletePulseDefinition(id: string): Promise<void> {
  await withPulseLock(async () => {
    const pulses = await readPulseDefinitions();
    const remaining = pulses.filter((pulse) => pulse.id !== id);
    if (remaining.length === pulses.length) throw new PulseHttpError(404, "Pulse not found.");
    await store().setJSON(definitionsKey, remaining, { onlyIfNew: false });
  });
}

export async function markPulseDone(occurrenceId: string, completionNote?: string): Promise<Record<string, unknown>> {
  return withPulseLock(() => withState((stateStore) => {
    const state = stateStore.read();
    const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
    if (!occurrence) throw new PulseHttpError(404, "Occurrence not found.");
    if (occurrence.state === "done") throw new PulseHttpError(409, "Occurrence is already done.");
    if (!canCompleteOccurrence(occurrence)) throw new PulseHttpError(409, "Occurrence is not active yet.");
    const action = { type: "done" as const, at: new Date(), ...(completionNote === undefined ? {} : { completionNote }) };
    const completed = applyOccurrenceAction(occurrence, action);
    state.occurrences = state.occurrences.map((candidate) => candidate.id === completed.id ? completed : candidate);
    state.events.push(createPulseEvent({
      pulseId: completed.pulseId,
      occurrenceId: completed.id,
      type: "occurrence_completed",
      at: new Date(completed.completedAt ?? action.at),
      ...(completionNote === undefined ? {} : { metadata: { note: completionNote } }),
    }));
    stateStore.write(state);
    return { occurrence: completed };
  }));
}

/**
 * Marks a due occurrence complete from the Android notification action. This
 * endpoint is intentionally idempotent: stale repeated notifications can be
 * cleared safely after the first successful acknowledgement.
 */
export async function markPulseDoneFromNotification(occurrenceId: string): Promise<Record<string, unknown>> {
  return withPulseLock(() => withState((stateStore) => {
    const state = stateStore.read();
    const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
    if (!occurrence) throw new PulseHttpError(404, "Occurrence not found.");
    if (occurrence.state === "done") return { occurrence, alreadyDone: true };
    if (!canCompleteOccurrence(occurrence)) throw new PulseHttpError(409, "Occurrence is not active yet.");
    const action = { type: "done" as const, at: new Date(), completionNote: "Acknowledged from Android notification." };
    const completed = applyOccurrenceAction(occurrence, action);
    state.occurrences = state.occurrences.map((candidate) => candidate.id === completed.id ? completed : candidate);
    state.events.push(createPulseEvent({
      pulseId: completed.pulseId,
      occurrenceId: completed.id,
      type: "occurrence_completed",
      at: new Date(completed.completedAt ?? action.at),
      metadata: { note: action.completionNote, source: "notification-action" },
    }));
    stateStore.write(state);
    return { occurrence: completed, alreadyDone: false };
  }));
}

export type NotificationCleanupStatus = "deleted" | "pending" | "not_available";

/** Delete only the sequenced ntfy messages belonging to one completed occurrence.
 * Completion remains durable even if ntfy is temporarily unavailable; the
 * scheduled runner retries failed cleanup events later. */
export async function cleanupNotificationSequenceFromNotification(occurrenceId: string): Promise<NotificationCleanupStatus> {
  const state = await readState();
  const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
  if (!occurrence) throw new PulseHttpError(404, "Occurrence not found.");
  const sentEvent = [...state.events].reverse().find((event) => event.type === "notification_sent" && event.occurrenceId === occurrenceId && event.metadata?.ok === true && isPulseNtfySequenceId(event.metadata?.sequenceId));
  if (sentEvent === undefined) return "not_available";
  const sequenceId = sentEvent.metadata?.sequenceId;
  if (!isPulseNtfySequenceId(sequenceId)) return "not_available";
  const alreadyDeleted = state.events.some((event) => event.type === "notification_sequence_cleanup" && event.occurrenceId === occurrenceId && event.metadata?.sequenceId === sequenceId && event.metadata?.ok === true);
  if (alreadyDeleted) return "deleted";

  const env = {
    PULSE_NOTIFY_PROVIDER: process.env.PULSE_NOTIFY_PROVIDER,
    PULSE_NTFY_SERVER: process.env.PULSE_NTFY_SERVER,
    PULSE_NTFY_TOPIC: process.env.PULSE_NTFY_TOPIC,
    PULSE_NTFY_TOKEN: await notificationDeliveryToken(),
  };
  let cleanup: { ok: boolean; detail?: string };
  try {
    const notifier = createNotificationDispatcherFromEnv(env);
    cleanup = await notifier.deleteOccurrenceSequence?.({ occurrence, sequenceId, now: new Date() })
      ?? { ok: false, detail: "Notification provider does not support sequence deletion." };
  } catch (error) {
    cleanup = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
  const detail = redactValues(cleanup.detail ?? "", [env.PULSE_NTFY_TOPIC, env.PULSE_NTFY_TOKEN]);
  await withPulseLock(() => withState((stateStore) => {
    const latest = stateStore.read();
    const successAlreadyRecorded = latest.events.some((event) => event.type === "notification_sequence_cleanup" && event.occurrenceId === occurrenceId && event.metadata?.sequenceId === sequenceId && event.metadata?.ok === true);
    if (!successAlreadyRecorded) {
      latest.events.push(createPulseEvent({
        pulseId: occurrence.pulseId,
        occurrenceId,
        type: "notification_sequence_cleanup",
        at: new Date(),
        metadata: { channel: "ntfy", sequenceId, ok: cleanup.ok, detail },
      }));
      stateStore.write(latest);
    }
  }));
  return cleanup.ok ? "deleted" : "pending";
}

export async function snoozePulseFromNotification(occurrenceId: string): Promise<Record<string, unknown>> {
  return withPulseLock(async () => {
    const pulses = await readPulseDefinitions();
    return withState((stateStore) => {
    const state = stateStore.read();
    const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
    if (!occurrence) throw new PulseHttpError(404, "Occurrence not found.");
    const pulse = pulses.find((candidate) => candidate.id === occurrence.pulseId);
    if (!pulse) throw new PulseHttpError(404, "Pulse definition not found for occurrence.");
    if (occurrence.state === "done") return { occurrence, alreadyDone: true };
    if (occurrence.state === "scheduled") return { occurrence, alreadySnoozed: true };
    if (occurrence.state !== "due") throw new PulseHttpError(409, "Occurrence is not due yet.");
    const at = new Date();
    const snoozeEveryMinutes = pulse.notificationPolicy?.snoozeEveryMinutes ?? 30;
    const snoozed = applyOccurrenceAction(occurrence, {
      type: "snooze",
      at,
      until: new Date(at.getTime() + snoozeEveryMinutes * 60_000),
    });
    state.occurrences = state.occurrences.map((candidate) => candidate.id === snoozed.id ? snoozed : candidate);
    state.events.push(createPulseEvent({
      pulseId: snoozed.pulseId,
      occurrenceId: snoozed.id,
      type: "occurrence_snoozed",
      at,
      metadata: { until: snoozed.dueAt, source: "notification-action" },
    }));
    stateStore.write(state);
    return { occurrence: snoozed, alreadyDone: false };
    });
  });
}

export async function doneActionUrl(input: { occurrence: { id: string } }): Promise<string> {
  return notificationActionUrl("done", input.occurrence.id);
}

export async function snoozeActionUrl(input: { occurrence: { id: string } }): Promise<string> {
  return notificationActionUrl("snooze", input.occurrence.id);
}

async function notificationActionUrl(action: "done" | "snooze", occurrenceId: string): Promise<string> {
  const baseUrl = new URL(deployedPublicBaseUrl());
  if (baseUrl.protocol !== "https:") throw new Error("Pulse public base URL must use https.");
  const url = new URL(`/api/v1/notification-actions/${encodeURIComponent(occurrenceId)}/${action}`, baseUrl);
  url.searchParams.set("token", await signNotificationAction(action, occurrenceId));
  return url.toString();
}

export async function verifyNotificationAction(action: "done" | "snooze", occurrenceId: string, token: string | null): Promise<void> {
  if (token === null || token === "") throw new PulseHttpError(401, "Missing notification action token.");
  const signature = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await notificationActionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    signature,
    fromBase64Url(token) as unknown as BufferSource,
    new TextEncoder().encode(`${action}:${occurrenceId}`),
  );
  if (!valid) throw new PulseHttpError(401, "Invalid notification action token.");
}

export async function requirePulseAuthorization(request: Request, now: Date = new Date()): Promise<void> {
  await withRunnerSetupState(async (state) => {
    await requireRunnerAuthorizationFromState(request, state, now);
  });
}

export class PulseHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function pulseJson(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value)}\n`, { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export function pulseError(error: unknown): Response {
  if (error instanceof PulseHttpError) return pulseJson({ message: error.message }, error.status);
  console.error("Pulse Netlify function failed", error);
  return pulseJson({ message: "Pulse runner failed." }, 500);
}

export async function readBoundedJsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumSetupRequestBytes) {
    throw new PulseHttpError(413, "Setup request is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumSetupRequestBytes) {
    throw new PulseHttpError(413, "Setup request is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PulseHttpError(400, "Setup request must be valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PulseHttpError(400, "Setup request must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export async function readPublicRunnerManifest(): Promise<Record<string, unknown>> {
  return withRunnerSetupState((state) => readRunnerManifest(state));
}

export async function issuePublicRunnerChallenge(input: Record<string, unknown>, now: Date = new Date()): Promise<Record<string, unknown>> {
  const installationId = requiredSetupString(input, "installationId");
  return withRunnerSetupState((state) => {
    try {
      return createRunnerPairingChallenge(state, { installationId, now });
    } catch (error) {
      throw setupHttpError(error);
    }
  });
}

export async function pairPublicRunnerClient(input: Record<string, unknown>, now: Date = new Date()): Promise<Record<string, unknown>> {
  const proof: RunnerPairingProof = {
    apiVersion: requiredSetupString(input, "apiVersion"),
    challengeId: requiredSetupString(input, "challengeId"),
    installationId: requiredSetupString(input, "installationId"),
    origin: requiredSetupString(input, "origin"),
    signature: requiredSetupString(input, "signature"),
  };
  return withRunnerSetupState(async (state) => {
    try {
      return await pairFirstRunnerClient(state, proof, { now });
    } catch (error) {
      throw setupHttpError(error, 401);
    }
  });
}

export async function pairAdditionalPublicRunnerClient(input: Record<string, unknown>, now: Date = new Date()): Promise<Record<string, unknown>> {
  return withRunnerSetupState(async (state) => {
    try {
      return await pairAdditionalRunnerClient(
        state,
        {
          code: requiredSetupString(input, "code"),
          installationId: requiredSetupString(input, "installationId"),
          origin: requiredSetupString(input, "origin"),
        },
        { now },
      );
    } catch (error) {
      throw setupHttpError(error, 401);
    }
  });
}

export async function listRunnerClients(request: Request, now: Date = new Date()): Promise<{ clients: PublicRunnerClient[]; currentClientId: string | null }> {
  return withRunnerSetupState(async (state) => {
    const credential = await requireRunnerAuthorizationFromState(request, state, now);
    let currentClientId: string | null = null;
    try { currentClientId = await authenticateRunnerClient(state, credential, now); } catch { /* legacy migration token */ }
    return { clients: state.clients.map(({ credentialVerifier: _credentialVerifier, ...client }) => client), currentClientId };
  });
}

export async function issueAdditionalRunnerClientCode(
  request: Request,
  input: Record<string, unknown>,
  now: Date = new Date(),
): Promise<Record<string, unknown>> {
  return withRunnerSetupState(async (state) => {
    const credential = await requireRunnerAuthorizationFromState(request, state, now, { legacyAllowed: false });
    try {
      return await createAdditionalDeviceCode(state, credential, {
        installationId: requiredSetupString(input, "installationId"),
        origin: state.canonicalOrigin,
        now,
      });
    } catch (error) {
      throw setupHttpError(error);
    }
  });
}

export async function revokePublicRunnerClient(
  request: Request,
  clientId: string,
  now: Date = new Date(),
): Promise<PublicRunnerClient> {
  return withRunnerSetupState(async (state) => {
    const credential = await requireRunnerAuthorizationFromState(request, state, now, { legacyAllowed: false });
    try {
      return await revokeRunnerClient(state, credential, clientId, now);
    } catch (error) {
      throw setupHttpError(error);
    }
  });
}

export async function sendRunnerSetupTestNotification(
  request: Request,
  input: Record<string, unknown>,
  now: Date = new Date(),
): Promise<{ accepted: true; repeated: boolean; sentAt: string; sequenceId: string }> {
  const idempotencyKey = requiredSetupString(input, "idempotencyKey");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{7,119}$/.test(idempotencyKey)) {
    throw new PulseHttpError(400, "A valid setup test idempotency key is required.");
  }
  return withRunnerSetupState(async (state) => {
    await requireRunnerAuthorizationFromState(request, state, now);
    const existing = state.testDeliveries.find((candidate) => candidate.idempotencyKey === idempotencyKey);
    if (existing !== undefined) return { accepted: true, repeated: true, ...existing };
    const server = requiredEnv("PULSE_NTFY_SERVER").replace(/\/+$/, "");
    const topic = requiredEnv("PULSE_NTFY_TOPIC");
    const token = await notificationDeliveryToken();
    const sequenceId = `pulse-setup-${await stableSetupId(idempotencyKey)}`;
    const response = await fetch(`${server}/${encodeURIComponent(topic)}/${sequenceId}`, {
      method: "POST",
      headers: {
        ...(token === undefined || token === "" ? {} : { authorization: `Bearer ${token}` }),
        "content-type": "text/plain; charset=utf-8",
        priority: "high",
        tags: "white_check_mark",
        title: "Pulse setup test",
      },
      body: "Your Pulse runner reached ntfy. Return to Workshop and choose I got it.",
    });
    if (!response.ok) throw new PulseHttpError(422, "Your runner is online, but notification delivery needs repair.");
    const sentAt = now.toISOString();
    state.testDeliveries.push({ idempotencyKey, sentAt, sequenceId });
    return { accepted: true, repeated: false, sentAt, sequenceId };
  });
}

export async function issueRunnerNotificationSecretSession(
  request: Request,
  now: Date = new Date(),
): Promise<{ url: string; expiresAt: string }> {
  requireProductionRunnerContext();
  return withRunnerSetupState(async (state) => {
    const credential = await requireRunnerAuthorizationFromState(request, state, now, { legacyAllowed: false });
    const session = await createRunnerSecretSetupSession(state, credential, now);
    const fragment = new URLSearchParams({ session: session.sessionId, capability: session.capability });
    return {
      url: `${state.canonicalOrigin}/setup/notification#${fragment.toString()}`,
      expiresAt: session.expiresAt,
    };
  });
}

export async function exchangeRunnerNotificationSecretSession(
  request: Request,
  input: Record<string, unknown>,
  now: Date = new Date(),
): Promise<{ cookie: string }> {
  requireProductionRunnerContext();
  const origin = request.headers.get("origin") ?? "";
  const sessionId = requiredSetupString(input, "sessionId");
  const capability = requiredSetupString(input, "capability");
  await withRunnerSetupState(async (state) => {
    try {
      await validateRunnerSecretSetupSession(state, { sessionId, capability, origin, now });
    } catch (error) {
      throw setupHttpError(error, 401);
    }
  });
  return {
    cookie: `${notificationSetupCookie}=${sessionId}.${capability}; Path=/api/setup/notification-secret; Max-Age=600; Secure; HttpOnly; SameSite=Strict`,
  };
}

export async function readRunnerSetupStatus(
  request: Request,
  now: Date = new Date(),
): Promise<{ connected: true; notificationConfigured: boolean }> {
  return withRunnerSetupState(async (state) => {
    await requireRunnerAuthorizationFromState(request, state, now);
    const secret = await store().get(runnerDeliverySecretKey, { type: "json", consistency: "strong" }) as {
      schemaVersion?: string;
      provider?: string;
      token?: string;
    } | null;
    return {
      connected: true,
      notificationConfigured:
        (secret?.schemaVersion === "pulse.runner-delivery-secret.v1" &&
          secret.provider === "ntfy" &&
          typeof secret.token === "string" &&
          secret.token.length >= 16) ||
        (typeof process.env.PULSE_NTFY_TOKEN === "string" &&
          process.env.PULSE_NTFY_TOKEN.length >= 16),
    };
  });
}

export async function saveRunnerNotificationSecret(
  request: Request,
  input: Record<string, unknown>,
  now: Date = new Date(),
): Promise<void> {
  requireProductionRunnerContext();
  const requestOrigin = request.headers.get("origin") ?? "";
  const token = requiredSetupString(input, "token");
  const cookie = notificationSetupCookieValue(request);
  const separator = cookie.indexOf(".");
  if (separator < 1 || separator === cookie.length - 1) {
    throw new PulseHttpError(401, "The secure setup session is missing or invalid.");
  }
  const sessionId = cookie.slice(0, separator);
  const capability = cookie.slice(separator + 1);
  if (token.length < 16 || token.length > 4_096 || /[\r\n\0]/.test(token)) {
    throw new PulseHttpError(400, "The notification token is invalid.");
  }
  await withRunnerSetupState(async (state) => {
    try {
      await consumeRunnerSecretSetupSession(state, {
        sessionId,
        capability,
        origin: requestOrigin,
        now,
      });
    } catch (error) {
      throw setupHttpError(error, 401);
    }
    const existing = await store().getWithMetadata(runnerDeliverySecretKey, { type: "json", consistency: "strong" });
    const record = {
      schemaVersion: "pulse.runner-delivery-secret.v1",
      provider: "ntfy",
      token,
      updatedAt: now.toISOString(),
    };
    const result = existing?.etag === undefined
      ? await store().setJSON(runnerDeliverySecretKey, record, { onlyIfNew: true })
      : await store().setJSON(runnerDeliverySecretKey, record, { onlyIfMatch: existing.etag });
    if (!result.modified) throw new Error("Notification access changed unexpectedly; reopen the secure setup page.");
  });
}

export function runnerNotificationSecretPage(): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Connect ntfy to Pulse</title>
<style>body{font:16px/1.5 system-ui;background:#0e0e11;color:#f7f5f7;margin:0}main{max-width:620px;margin:8vh auto;padding:32px}label{display:block;font-weight:700;margin:24px 0 8px}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:12px;padding:14px}input{background:#17171c;color:inherit;border:1px solid #555}button{margin-top:16px;border:0;background:#ff4aa2;color:#111;font-weight:800}p{color:#bbb}#status{min-height:1.5em}</style></head>
<body><main><p>Pulse runner · secure setup</p><h1>Save ntfy access</h1><p>This page belongs to your runner. Your token is stored privately here and is never returned to Workshop.</p>
<form id="secret-form"><label for="token">ntfy access token</label><input id="token" name="token" type="password" autocomplete="off" required minlength="16"><button id="save" type="submit" disabled>Preparing secure session…</button></form><p id="status" role="status" aria-live="polite"></p></main>
<script>const params=new URLSearchParams(location.hash.slice(1));let sessionId=params.get('session'),capability=params.get('capability');history.replaceState(null,'',location.pathname);params.delete('session');params.delete('capability');const form=document.getElementById('secret-form'),button=document.getElementById('save'),status=document.getElementById('status');let ready=false;fetch('/api/setup/notification-exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,capability})}).then(response=>{ready=response.ok;button.disabled=!ready;button.textContent=ready?'Save and return to Workshop':'Reopen this page from Workshop';if(!ready)status.textContent='This secure setup session is invalid or expired.';}).catch(()=>{button.textContent='Reopen this page from Workshop';status.textContent='The secure session could not be prepared.';}).finally(()=>{sessionId=null;capability=null;});form.addEventListener('submit',async(event)=>{event.preventDefault();if(!ready)return;button.disabled=true;status.textContent='Saving…';const response=await fetch('/api/setup/notification-secret',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:new FormData(form).get('token')})});form.reset();status.textContent=response.ok?'Saved. Return to Workshop.':'Could not save access. Reopen this page from Workshop.';});</script></body></html>`;
  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

function notificationSetupCookieValue(request: Request): string {
  const raw = request.headers.get("cookie") ?? "";
  const value = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${notificationSetupCookie}=`))
    ?.slice(notificationSetupCookie.length + 1) ?? "";
  if (value.length < 16 || value.length > 8_192 || /[^A-Za-z0-9_.-]/.test(value)) {
    throw new PulseHttpError(401, "The secure setup session is missing or invalid.");
  }
  return value;
}

async function readState(): Promise<PulseState> {
  return (await store().get(stateKey, { type: "json", consistency: "strong" }) as PulseState | null) ?? createEmptyPulseState();
}

async function withRunnerSetupState<T>(operation: (state: RunnerSetupState) => Promise<T> | T): Promise<T> {
  return withPulseLock(async () => {
    const entry = await store().getWithMetadata(runnerSetupKey, { type: "json", consistency: "strong" });
    const state = await bootstrapRunnerSetup((entry?.data as RunnerSetupState | undefined) ?? null, {
      canonicalOrigin: deployedPublicBaseUrl(),
      deployedPublicKey: requiredEnv("PULSE_SETUP_PUBLIC_KEY"),
    });
    try {
      const result = await operation(state);
      await writeRunnerSetupState(entry?.etag, state);
      return result;
    } catch (error) {
      await writeRunnerSetupState(entry?.etag, state);
      throw error;
    }
  });
}

async function writeRunnerSetupState(etag: string | undefined, state: RunnerSetupState): Promise<void> {
  const result = etag === undefined
    ? await store().setJSON(runnerSetupKey, state, { onlyIfNew: true })
    : await store().setJSON(runnerSetupKey, state, { onlyIfMatch: etag });
  if (!result.modified) throw new Error("Pulse runner setup changed unexpectedly while locked.");
}

async function requireRunnerAuthorizationFromState(
  request: Request,
  state: RunnerSetupState,
  now: Date,
  options: { legacyAllowed?: boolean } = {},
): Promise<string> {
  const authorization = request.headers.get("authorization") ?? "";
  const credential = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (credential !== "") {
    try {
      await authenticateRunnerClient(state, credential, now);
      return credential;
    } catch {
      if (options.legacyAllowed !== false && constantShapeTextEqual(credential, process.env.PULSE_API_TOKEN ?? "")) {
        return credential;
      }
    }
  }
  throw new PulseHttpError(401, "Unauthorized.");
}

function requiredSetupString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "" || value.length > 4096) {
    throw new PulseHttpError(400, `Setup field ${key} is required.`);
  }
  return value.trim();
}

function setupHttpError(error: unknown, fallbackStatus = 400): PulseHttpError {
  const message = error instanceof Error ? error.message : "Setup request failed.";
  const status = /too many/i.test(message) ? 429 : fallbackStatus;
  return new PulseHttpError(status, message);
}

async function stableSetupId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url").slice(0, 24);
}

function constantShapeTextEqual(left: string, right: string): boolean {
  if (left === "" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function readPulseDefinitions(): Promise<PulseDefinition[]> {
  const saved = await store().get(definitionsKey, { type: "json", consistency: "strong" }) as unknown;
  if (saved !== null) return parsePulseDefinitions(saved);
  const bootstrapConfig = process.env.PULSE_CONFIG_YAML;
  return bootstrapConfig === undefined || bootstrapConfig.trim() === ""
    ? []
    : loadPulseDefinitionsFromYaml(bootstrapConfig);
}

async function withState<T>(operation: (stateStore: ReturnType<typeof createMemoryPulseStateStore>) => Promise<T> | T): Promise<T> {
  const entry = await store().getWithMetadata(stateKey, { type: "json", consistency: "strong" });
  const stateStore = createMemoryPulseStateStore((entry?.data as PulseState | undefined) ?? createEmptyPulseState());
  const result = await operation(stateStore);
  const write = entry?.etag === undefined
    ? await store().setJSON(stateKey, stateStore.read(), { onlyIfNew: true })
    : await store().setJSON(stateKey, stateStore.read(), { onlyIfMatch: entry.etag });
  if (!write.modified) throw new Error("Pulse state changed unexpectedly while locked.");
  return result;
}

async function withPulseLock<T>(operation: () => Promise<T>): Promise<T> {
  const owner = crypto.randomUUID();
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const existing = await store().getWithMetadata(lockKey, { type: "json", consistency: "strong" });
    const lease: Lease = { owner, expiresAt: new Date(Date.now() + lockLeaseMs).toISOString() };
    const acquired = existing === null
      ? await store().setJSON(lockKey, lease, { onlyIfNew: true })
      : Date.parse((existing.data as Lease).expiresAt) < Date.now()
        ? await store().setJSON(lockKey, lease, { onlyIfMatch: existing.etag ?? "" })
        : { modified: false };
    if (acquired.modified) {
      try { return await operation(); } finally { await store().delete(lockKey); }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Pulse state is busy; try again shortly.");
}

function store(): PulseBlobStore {
  return testStore ?? getStore({ name: "pulse", consistency: "strong" }) as unknown as PulseBlobStore;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required in Netlify environment variables.`);
  return value;
}

function deployedPublicBaseUrl(): string {
  const value = process.env.URL?.trim() || process.env.PULSE_PUBLIC_BASE_URL?.trim();
  if (!value) throw new Error("Netlify's production URL is unavailable.");
  return value;
}

async function signNotificationAction(action: "done" | "snooze", occurrenceId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await notificationActionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${action}:${occurrenceId}`)));
}

async function notificationActionSecret(): Promise<string> {
  const existing = await store().get(runnerSecretsKey, { type: "json", consistency: "strong" }) as {
    schemaVersion?: string;
    notificationActionSecret?: string;
  } | null;
  if (existing?.schemaVersion === "pulse.runner-secrets.v1" && existing.notificationActionSecret) {
    return existing.notificationActionSecret;
  }
  const legacySecret = process.env.PULSE_NOTIFICATION_ACTION_SECRET?.trim();
  const generated = legacySecret || randomPrivateSecret();
  const created = await store().setJSON(
    runnerSecretsKey,
    { schemaVersion: "pulse.runner-secrets.v1", notificationActionSecret: generated },
    { onlyIfNew: true },
  );
  if (created.modified) return generated;
  const concurrent = await store().get(runnerSecretsKey, { type: "json", consistency: "strong" }) as {
    notificationActionSecret?: string;
  } | null;
  if (!concurrent?.notificationActionSecret) throw new Error("Pulse runner signing material could not be initialized.");
  return concurrent.notificationActionSecret;
}

async function notificationDeliveryToken(): Promise<string | undefined> {
  if (process.env.CONTEXT && process.env.CONTEXT !== "production") return undefined;
  const stored = await store().get(runnerDeliverySecretKey, { type: "json", consistency: "strong" }) as {
    schemaVersion?: string;
    provider?: string;
    token?: string;
  } | null;
  if (
    stored?.schemaVersion === "pulse.runner-delivery-secret.v1" &&
    stored.provider === "ntfy" &&
    typeof stored.token === "string" &&
    stored.token.length >= 16
  ) {
    return stored.token;
  }
  return process.env.PULSE_NTFY_TOKEN?.trim() || undefined;
}

function requireProductionRunnerContext(): void {
  if (process.env.CONTEXT !== "production") {
    throw new PulseHttpError(403, "Notification access can only be configured on the production runner.");
  }
}

function randomPrivateSecret(): string {
  const value = new Uint8Array(32);
  crypto.getRandomValues(value);
  return Buffer.from(value).toString("base64url");
}

function toBase64Url(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array {
  return Buffer.from(value, "base64url");
}

function redactValues(detail: string, values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => value !== undefined && value !== "")
    .reduce((redacted, value) => redacted.split(value).join("[redacted]"), detail);
}
