import assert from "node:assert/strict";
import { test } from "node:test";

import pulsesHandler, { config as pulsesConfig } from "../netlify/functions/pulse-pulses.ts";
import snapshotHandler, { config as snapshotConfig } from "../netlify/functions/pulse-snapshot.ts";
import pulseHandler, { config as pulseConfig } from "../netlify/functions/pulse-pulse.ts";
import doneNotificationHandler from "../netlify/functions/pulse-notification-done.ts";
import snoozeNotificationHandler from "../netlify/functions/pulse-notification-snooze.ts";
import { readPulseSnapshot, runScheduledPulseTick, setPulseBlobStoreForTest, type PulseBlobStore } from "../netlify/functions/_shared/pulse.ts";

class MemoryBlobStore implements PulseBlobStore {
  private entries = new Map<string, { data: unknown; etag: string }>();
  private revision = 0;
  async get(key: string): Promise<unknown> { return this.entries.get(key)?.data ?? null; }
  async getWithMetadata(key: string): Promise<{ data: unknown; etag?: string } | null> {
    const entry = this.entries.get(key);
    return entry ? { ...entry } : null;
  }
  async setJSON(key: string, value: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string }): Promise<{ modified: boolean }> {
    const current = this.entries.get(key);
    if (options.onlyIfNew === true && current !== undefined) return { modified: false };
    if (options.onlyIfMatch !== undefined && current?.etag !== options.onlyIfMatch) return { modified: false };
    this.entries.set(key, { data: structuredClone(value), etag: `etag-${++this.revision}` });
    return { modified: true };
  }
  async delete(key: string): Promise<void> { this.entries.delete(key); }
}

const basePulse = (id: string, snoozeEveryMinutes?: number) => ({
  id,
  title: `Reminder ${id}`,
  active: true,
  schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:30", timezone: "America/Los_Angeles" },
  notificationPolicy: {
    channels: ["ntfy"],
    repeatEveryMinutes: 30,
    ...(snoozeEveryMinutes === undefined ? {} : { snoozeEveryMinutes }),
  },
});

test("Netlify functions use authenticated Blob-backed definitions and preserve concurrent writes", async () => {
  const envNames = ["PULSE_API_TOKEN", "PULSE_NOTIFY_PROVIDER", "PULSE_NTFY_SERVER", "PULSE_NTFY_TOPIC", "PULSE_NTFY_TOKEN", "PULSE_PUBLIC_BASE_URL", "PULSE_NOTIFICATION_ACTION_SECRET"] as const;
  const before = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    PULSE_API_TOKEN: "test-api-token",
    PULSE_NOTIFY_PROVIDER: "ntfy",
    PULSE_NTFY_SERVER: "https://ntfy.test",
    PULSE_NTFY_TOPIC: "test-topic",
    PULSE_NTFY_TOKEN: "test-notification-token",
    PULSE_PUBLIC_BASE_URL: "https://pulse.test",
    PULSE_NOTIFICATION_ACTION_SECRET: "test-notification-action-secret",
  });
  setPulseBlobStoreForTest(new MemoryBlobStore());
  const originalFetch = globalThis.fetch;
  const deliveries: Array<{ url: string; actions: string }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    deliveries.push({ url: String(url), actions: String((init?.headers as Record<string, string>)?.actions ?? "") });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  const authorized = (url: string, init: RequestInit = {}) => new Request(url, { ...init, headers: { authorization: "Bearer test-api-token", ...(init.headers ?? {}) } });
  try {
    assert.equal((await pulsesHandler(new Request("https://pulse.test/api/v1/pulses"))).status, 401);
    const created = await pulsesHandler(authorized("https://pulse.test/api/v1/pulses", { method: "POST", body: JSON.stringify(basePulse("first")) }));
    assert.equal(created.status, 201);
    assert.equal((await created.json()).pulse.id, "first");

    await Promise.all([
      pulsesHandler(authorized("https://pulse.test/api/v1/pulses", { method: "POST", body: JSON.stringify(basePulse("second", 1440)) })),
      pulsesHandler(authorized("https://pulse.test/api/v1/pulses", { method: "POST", body: JSON.stringify(basePulse("third")) })),
    ]);
    const snapshot = await snapshotHandler(authorized("https://pulse.test/api/v1/snapshot"));
    assert.deepEqual((await snapshot.json()).pulses.map((pulse: { id: string }) => pulse.id).sort(), ["first", "second", "third"]);

    const updated = await pulseHandler(authorized("https://pulse.test/api/v1/pulses/first", { method: "PATCH", body: JSON.stringify({ ...basePulse("first"), active: false }) }), { params: { id: "first" } } as never);
    assert.equal((await updated.json()).pulse.active, false);
    const removed = await pulseHandler(authorized("https://pulse.test/api/v1/pulses/third", { method: "DELETE" }), { params: { id: "third" } } as never);
    assert.equal(removed.status, 204);
    assert.deepEqual((await readPulseSnapshot()).pulses.map((pulse) => pulse.id).sort(), ["first", "second"]);

    await runScheduledPulseTick(new Date("2026-08-09T16:50:00.000Z"));
    const afterRun = await readPulseSnapshot();
    const due = afterRun.state.occurrences.find((occurrence: { state: string }) => occurrence.state === "due");
    assert.equal(afterRun.runnerHealth.checkedAt, "2026-08-09T16:50:00.000Z");
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.url, "https://ntfy.test/test-topic");
    assert.match(deliveries[0]?.actions ?? "", /Mark done/);
    const doneUrl = new URL((deliveries[0]?.actions.match(/http, Mark done, ([^,]+),/) ?? [])[1]);
    const snoozeUrl = new URL((deliveries[0]?.actions.match(/http, Snooze[^,]*, ([^,]+),/) ?? [])[1]);
    const snoozed = await snoozeNotificationHandler(new Request(snoozeUrl, { method: "POST" }), { params: { id: encodeURIComponent(due.id) } } as never);
    assert.equal(snoozed.status, 200);
    const snoozedOccurrence = (await snoozed.json()).occurrence;
    assert.equal(snoozedOccurrence.state, "scheduled");
    assert.equal(snoozedOccurrence.snoozeCount, 1);
    assert.equal(Date.parse(snoozedOccurrence.dueAt) - Date.parse(snoozedOccurrence.snoozedAt), 1440 * 60_000);

    await runScheduledPulseTick(new Date(snoozedOccurrence.dueAt));
    const completed = await doneNotificationHandler(new Request(doneUrl, { method: "POST" }), { params: { id: encodeURIComponent(due.id) } } as never);
    assert.equal(completed.status, 200);
    assert.equal((await completed.json()).occurrence.state, "done");

    assert.equal(pulsesConfig.path, "/api/v1/pulses");
    assert.equal(snapshotConfig.path, "/api/v1/snapshot");
    assert.equal(pulseConfig.path, "/api/v1/pulses/:id");
  } finally {
    setPulseBlobStoreForTest(undefined);
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name];
    }
  }
});
