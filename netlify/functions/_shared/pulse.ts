import { getStore } from "@netlify/blobs";

import { createNotificationDispatcherFromEnv } from "../../../src/adapters.js";
import { loadPulseDefinitionsFromYaml, parsePulseDefinitions, applyOccurrenceAction, createPulseEvent, type PulseDefinition } from "../../../src/model.js";
import { runPulseRunnerTick } from "../../../src/runner.js";
import { createEmptyPulseState, createMemoryPulseStateStore, type PulseState } from "../../../src/storage.js";

const stateKey = "state.json";
const lockKey = "state.lock";
const heartbeatKey = "runner-heartbeat.json";
const definitionsKey = "definitions.json";
const lockLeaseMs = 55_000;

type Lease = { owner: string; expiresAt: string };

export async function runScheduledPulseTick(now: Date = new Date()): Promise<void> {
  await withPulseLock(async () => {
    const result = await withState(async (stateStore) => {
      const pulses = await readPulseDefinitions();
      const env = {
        PULSE_NOTIFY_PROVIDER: requiredEnv("PULSE_NOTIFY_PROVIDER"),
        PULSE_NTFY_SERVER: requiredEnv("PULSE_NTFY_SERVER"),
        PULSE_NTFY_TOPIC: requiredEnv("PULSE_NTFY_TOPIC"),
        PULSE_NTFY_TOKEN: process.env.PULSE_NTFY_TOKEN || undefined,
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

export async function updatePulseDefinition(id: string, input: unknown): Promise<PulseDefinition> {
  const [pulse] = parsePulseDefinitions([input]);
  if (pulse.id !== id) throw new PulseHttpError(400, "A pulse id cannot be changed.");
  return withPulseLock(async () => {
    const pulses = await readPulseDefinitions();
    const index = pulses.findIndex((candidate) => candidate.id === id);
    if (index === -1) throw new PulseHttpError(404, "Pulse not found.");
    pulses[index] = pulse;
    await store().setJSON(definitionsKey, pulses, { onlyIfNew: false });
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
    if (occurrence.state !== "due") throw new PulseHttpError(409, "Occurrence is not due yet.");
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
    if (occurrence.state !== "due") throw new PulseHttpError(409, "Occurrence is not due yet.");
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

export async function snoozePulseFromNotification(occurrenceId: string): Promise<Record<string, unknown>> {
  return withPulseLock(() => withState((stateStore) => {
    const state = stateStore.read();
    const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
    if (!occurrence) throw new PulseHttpError(404, "Occurrence not found.");
    if (occurrence.state === "done") return { occurrence, alreadyDone: true };
    if (occurrence.state === "scheduled") return { occurrence, alreadySnoozed: true };
    if (occurrence.state !== "due") throw new PulseHttpError(409, "Occurrence is not due yet.");
    const at = new Date();
    const snoozed = applyOccurrenceAction(occurrence, {
      type: "snooze",
      at,
      until: new Date(at.getTime() + 30 * 60_000),
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
  }));
}

export async function doneActionUrl(input: { occurrence: { id: string } }): Promise<string> {
  return notificationActionUrl("done", input.occurrence.id);
}

export async function snoozeActionUrl(input: { occurrence: { id: string } }): Promise<string> {
  return notificationActionUrl("snooze", input.occurrence.id);
}

async function notificationActionUrl(action: "done" | "snooze", occurrenceId: string): Promise<string> {
  const baseUrl = new URL(requiredEnv("PULSE_PUBLIC_BASE_URL"));
  if (baseUrl.protocol !== "https:") throw new Error("PULSE_PUBLIC_BASE_URL must use https.");
  const url = new URL(`/api/v1/notification-actions/${encodeURIComponent(occurrenceId)}/${action}`, baseUrl);
  url.searchParams.set("token", await signNotificationAction(action, occurrenceId));
  return url.toString();
}

export async function verifyNotificationAction(action: "done" | "snooze", occurrenceId: string, token: string | null): Promise<void> {
  if (token === null || token === "") throw new PulseHttpError(401, "Missing notification action token.");
  const signature = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("PULSE_NOTIFICATION_ACTION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    signature,
    fromBase64Url(token),
    new TextEncoder().encode(`${action}:${occurrenceId}`),
  );
  if (!valid) throw new PulseHttpError(401, "Invalid notification action token.");
}

export function requirePulseAuthorization(request: Request): void {
  const token = requiredEnv("PULSE_API_TOKEN");
  if (request.headers.get("authorization") !== `Bearer ${token}`) throw new PulseHttpError(401, "Unauthorized.");
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

async function readState(): Promise<PulseState> {
  return (await store().get(stateKey, { type: "json", consistency: "strong" }) as PulseState | null) ?? createEmptyPulseState();
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

function store() { return getStore({ name: "pulse", consistency: "strong" }); }

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required in Netlify environment variables.`);
  return value;
}

async function signNotificationAction(action: "done" | "snooze", occurrenceId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("PULSE_NOTIFICATION_ACTION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${action}:${occurrenceId}`)));
}

function toBase64Url(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array {
  return Buffer.from(value, "base64url");
}
