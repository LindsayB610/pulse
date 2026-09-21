import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readPulseSnapshot,
  setPulseBlobStoreForTest,
  type PulseBlobStore,
} from "../netlify/functions/_shared/pulse.js";
import type { PulseDefinition, PulseEvent, PulseOccurrence } from "../src/model.js";
import { ntfySequenceIdForOccurrence } from "../src/ntfy-sequence.js";
import { createEmptyPulseState } from "../src/storage.js";

class SnapshotBlobStore implements PulseBlobStore {
  private readonly values = new Map<string, unknown>();

  seed(key: string, value: unknown): void { this.values.set(key, structuredClone(value)); }
  async get(key: string): Promise<unknown> { return structuredClone(this.values.get(key) ?? null); }
  async getWithMetadata(key: string): Promise<{ data: unknown; etag?: string } | null> {
    return this.values.has(key) ? { data: structuredClone(this.values.get(key)), etag: "fixture" } : null;
  }
  async setJSON(key: string, value: unknown): Promise<{ modified: boolean }> {
    this.values.set(key, structuredClone(value));
    return { modified: true };
  }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

const definition: PulseDefinition = {
  id: "medicine",
  title: "Take medicine",
  active: true,
  definitionRevision: 1,
  seriesRevision: 1,
  schedule: {
    version: 2,
    type: "daily",
    interval: 1,
    startDate: "2026-07-01",
    time: "09:00",
    timezone: "UTC",
    end: { type: "count", occurrences: 365 },
  },
  notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
};

function historyFixture(completedCount = 60, snoozesPerCompletion = 2): { occurrences: PulseOccurrence[]; events: PulseEvent[]; activeId: string } {
  const occurrences: PulseOccurrence[] = [];
  const events: PulseEvent[] = [];
  for (let ordinal = 1; ordinal <= completedCount; ordinal += 1) {
    const dueAt = new Date(Date.UTC(2026, 6, ordinal, 9)).toISOString();
    const completedAt = new Date(Date.parse(dueAt) + 35 * 60_000).toISOString();
    const id = `medicine:s1:${dueAt}`;
    occurrences.push({
      id,
      pulseId: "medicine",
      dueAt,
      state: "done",
      completedAt,
      seriesRevision: 1,
      ordinal,
      titleSnapshot: "Take medicine",
    });
    events.push(
      ...Array.from({ length: snoozesPerCompletion }, (_value, index): PulseEvent => ({
        id: `${id}:snooze-${index + 1}`,
        pulseId: "medicine",
        occurrenceId: id,
        type: "occurrence_snoozed",
        at: new Date(Date.parse(dueAt) + (index + 1) * 60_000).toISOString(),
      })),
      { id: `${id}:done`, pulseId: "medicine", occurrenceId: id, type: "occurrence_completed", at: completedAt },
    );
  }

  const activeDueAt = new Date(Date.UTC(2026, 6, completedCount + 1, 9)).toISOString();
  const activeId = `medicine:s1:${activeDueAt}`;
  occurrences.push({
    id: activeId,
    pulseId: "medicine",
    dueAt: activeDueAt,
    state: "due",
    seriesRevision: 1,
    ordinal: completedCount + 1,
    titleSnapshot: "Take medicine",
  });
  events.push(
    { id: `${activeId}:scheduled`, pulseId: "medicine", occurrenceId: activeId, type: "occurrence_scheduled", at: new Date(Date.parse(activeDueAt) - 86_400_000).toISOString() },
    { id: `${activeId}:due`, pulseId: "medicine", occurrenceId: activeId, type: "occurrence_became_due", at: activeDueAt },
  );
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    events.push({
      id: `${activeId}:failure-${attempt}`,
      pulseId: "medicine",
      occurrenceId: activeId,
      type: "notification_sent",
      at: new Date(Date.parse(activeDueAt) + attempt).toISOString(),
      metadata: { channel: "ntfy", ok: false, detail: "ntfy rejected the same header" },
    });
  }
  return { occurrences, events, activeId };
}

test("the secure-service snapshot stays below 64 KB while retaining active state and recent truthful history", async (context) => {
  const blob = new SnapshotBlobStore();
  const fixture = historyFixture();
  blob.seed("definitions.json", [definition]);
  blob.seed("state.json", { ...createEmptyPulseState(), version: 2, occurrences: fixture.occurrences, events: fixture.events });
  blob.seed("runner-heartbeat.json", { checkedAt: new Date().toISOString() });
  setPulseBlobStoreForTest(blob);
  try {
    const snapshot = await readPulseSnapshot();
    const bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    context.diagnostic(`2,000-failure snapshot: ${bytes} bytes`);
    const completed = snapshot.state.occurrences.filter((occurrence) => occurrence.state === "done");
    const active = snapshot.state.occurrences.find((occurrence) => occurrence.id === fixture.activeId);

    assert.ok(bytes < 64 * 1_024, `snapshot was ${bytes} bytes`);
    assert.equal(completed.length, 60, "all recent completion history is returned when it fits the byte budget");
    assert.equal(active?.state, "due");
    assert.equal(snapshot.seriesProgress.medicine?.generated, 61, "recurrence accounting uses full stored history");
    assert.equal(snapshot.seriesProgress.medicine?.remaining, 304);
    assert.equal(snapshot.state.events.length, 0, "runner audit events are not serialized into the management snapshot");
    for (const occurrence of completed) {
      assert.equal(occurrence.snoozeCount, 2, "recent completion history keeps its truthful summarized snooze count");
    }
    const oldest = fixture.occurrences.filter((occurrence) => occurrence.state === "done")[0]!;
    assert.equal(snapshot.state.occurrences.some((occurrence) => occurrence.id === oldest.id), true);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("high-snooze history and runner-internal cleanup work stay inside the full snapshot byte ceiling", async (context) => {
  const blob = new SnapshotBlobStore();
  const fixture = historyFixture(360, 20);
  const pendingNotificationSequenceCleanups = Array.from({ length: 100 }, (_value, index) => ({
    pulseId: "deleted-reminder",
    occurrenceId: `deleted-${index}`,
    sequenceId: ntfySequenceIdForOccurrence(`deleted-${index}`),
    requestedAt: "2026-09-21T09:00:00.000Z",
    titleSnapshot: `Deleted reminder ${index}`,
  }));
  blob.seed("definitions.json", [definition]);
  blob.seed("state.json", {
    ...createEmptyPulseState(),
    version: 2,
    occurrences: fixture.occurrences,
    events: fixture.events,
    pendingNotificationSequenceCleanups,
  });
  blob.seed("runner-heartbeat.json", { checkedAt: new Date().toISOString() });
  setPulseBlobStoreForTest(blob);
  try {
    const snapshot = await readPulseSnapshot();
    const bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
    const completed = snapshot.state.occurrences.filter((occurrence) => occurrence.state === "done");
    context.diagnostic(`high-snooze snapshot: ${bytes} bytes`);

    assert.ok(bytes <= 60 * 1_024, `snapshot was ${bytes} bytes`);
    assert.ok(completed.length > 0, "recent completion history remains useful");
    assert.ok(completed.length < 360, "history count is selected by bytes instead of a fixed row limit");
    assert.equal("pendingNotificationSequenceCleanups" in snapshot.state, false, "runner cleanup work is not management UI data");
    assert.ok(completed.every((occurrence) => occurrence.snoozeCount === 20), "snooze totals are summarized on each completion");
    assert.equal(snapshot.state.events.some((event) => event.type === "occurrence_snoozed"), false, "individual snooze audit events are not serialized");
    assert.equal(snapshot.seriesProgress.medicine?.generated, 361, "full stored history still drives recurrence progress");
    assert.equal(snapshot.seriesProgress.medicine?.remaining, 4);
    assert.equal(completed.some((occurrence) => occurrence.ordinal === 360), true, "the newest completion is retained");
    assert.equal(completed.some((occurrence) => occurrence.ordinal === 1), false, "the oldest completion yields first when the byte budget is full");
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});
