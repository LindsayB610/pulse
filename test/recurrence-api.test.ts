import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPulseDefinition,
  deletePulseDefinition,
  migratePulseRecurrence,
  PulseHttpError,
  readPulseSnapshot,
  setPulseBlobStoreForTest,
  updatePulseDefinition,
  type PulseBlobStore,
} from "../netlify/functions/_shared/pulse.js";
import { ntfySequenceIdForOccurrence } from "../src/ntfy-sequence.js";

class MemoryStore implements PulseBlobStore {
  entries = new Map<string, { data: unknown; etag: string }>();
  revision = 0;
  failStateWrite = false;
  throwStateWrite = false;
  definitionWritesUntilFailure: number | undefined;
  async get(key: string): Promise<unknown> { return structuredClone(this.entries.get(key)?.data ?? null); }
  async getWithMetadata(key: string): Promise<{ data: unknown; etag?: string } | null> {
    const entry = this.entries.get(key);
    return entry ? structuredClone(entry) : null;
  }
  async setJSON(key: string, value: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string }): Promise<{ modified: boolean }> {
    if (key === "state.json" && this.failStateWrite) { this.failStateWrite = false; return { modified: false }; }
    if (key === "state.json" && this.throwStateWrite) { this.throwStateWrite = false; throw new Error("simulated state outage"); }
    if (key === "definitions.json" && this.definitionWritesUntilFailure !== undefined) {
      this.definitionWritesUntilFailure -= 1;
      if (this.definitionWritesUntilFailure === 0) {
        this.definitionWritesUntilFailure = undefined;
        return { modified: false };
      }
    }
    const current = this.entries.get(key);
    if (options.onlyIfNew && current) return { modified: false };
    if (options.onlyIfMatch !== undefined && current?.etag !== options.onlyIfMatch) return { modified: false };
    this.entries.set(key, { data: structuredClone(value), etag: `etag-${++this.revision}` });
    return { modified: true };
  }
  async delete(key: string): Promise<void> { this.entries.delete(key); }
}

const onceDraft = (id = "once") => ({
  id,
  title: "One-time reminder",
  active: true,
  schedule: { version: 2, type: "once", date: "2026-08-30", time: "09:00", timezone: "UTC" },
  notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
});

test("cloud create and update assign revisions and reject stale writes", async () => {
  const store = new MemoryStore();
  setPulseBlobStoreForTest(store);
  try {
    const created = await createPulseDefinition(onceDraft(), new Date("2026-08-27T12:00:00.000Z"));
    assert.equal(created.definitionRevision, 1);
    assert.equal(created.seriesRevision, 1);
    await assert.rejects(
      updatePulseDefinition("once", { ...onceDraft(), title: "Missing revision" }),
      (error: unknown) => error instanceof PulseHttpError && error.status === 400,
    );
    const createdState = await store.get("state.json") as { version: number; occurrences: Array<{ pulseId: string; final: boolean }> };
    assert.deepEqual(createdState.occurrences.map((value) => ({ pulseId: value.pulseId, final: value.final })), [{ pulseId: "once", final: true }]);
    const updated = await updatePulseDefinition("once", { ...created, title: "Renamed" });
    assert.equal(updated.definitionRevision, 2);
    assert.equal(updated.seriesRevision, 1);
    await assert.rejects(
      updatePulseDefinition("once", { ...created, title: "Stale" }),
      (error: unknown) => error instanceof PulseHttpError && error.status === 409,
    );
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("creating a recurring reminder after today's selected time opens only the latest missed occurrence", async () => {
  setPulseBlobStoreForTest(new MemoryStore());
  try {
    const created = await createPulseDefinition({
      id: "late-start",
      title: "Late start",
      active: true,
      schedule: { version: 2, type: "daily", interval: 1, startDate: "2026-08-01", time: "09:00", timezone: "America/Los_Angeles", end: { type: "count", occurrences: 30 } },
      notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
    }, new Date("2026-08-27T17:00:00.000Z"));
    const snapshot = await readPulseSnapshot();
    assert.equal(created.id, "late-start");
    assert.deepEqual(snapshot.state.occurrences.map((occurrence) => occurrence.dueAt), ["2026-08-27T16:00:00.000Z"]);
    assert.equal(snapshot.state.occurrences[0]?.ordinal, 1);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("definition and occurrence writes roll back together when state persistence conflicts", async () => {
  const store = new MemoryStore();
  await store.setJSON("definitions.json", [{ ...onceDraft(), definitionRevision: 1, seriesRevision: 1 }], {});
  await store.setJSON("state.json", { version: 2, occurrences: [], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.failStateWrite = true;
    await assert.rejects(updatePulseDefinition("once", { ...onceDraft(), title: "Should roll back", definitionRevision: 1, seriesRevision: 1 }, new Date("2026-08-27T12:00:00.000Z")), /definitions were restored/);
    const definitions = await store.get("definitions.json") as Array<{ title: string; definitionRevision: number }>;
    assert.deepEqual(definitions.map(({ title, definitionRevision }) => ({ title, definitionRevision })), [{ title: "One-time reminder", definitionRevision: 1 }]);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("definition and occurrence writes roll back when state persistence throws", async () => {
  const store = new MemoryStore();
  const original = { ...onceDraft(), definitionRevision: 1, seriesRevision: 1 };
  await store.setJSON("definitions.json", [original], {});
  await store.setJSON("state.json", { version: 2, occurrences: [], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.throwStateWrite = true;
    await assert.rejects(
      updatePulseDefinition("once", { ...original, title: "Should roll back" }, new Date("2026-08-27T12:00:00.000Z")),
      /could not be saved.*definitions were restored.*simulated state outage/i,
    );
    assert.deepEqual(await store.get("definitions.json"), [original]);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("definition and occurrence writes report rollback failure without claiming restoration", async () => {
  const store = new MemoryStore();
  const original = { ...onceDraft(), definitionRevision: 1, seriesRevision: 1 };
  await store.setJSON("definitions.json", [original], {});
  await store.setJSON("state.json", { version: 2, occurrences: [], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.failStateWrite = true;
    store.definitionWritesUntilFailure = 2;
    await assert.rejects(
      updatePulseDefinition("once", { ...original, title: "Rollback also fails" }, new Date("2026-08-27T12:00:00.000Z")),
      /rollback failed.*may require repair/i,
    );
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("recreating a deleted reminder id starts above retained history instead of inheriting exhaustion", async () => {
  const store = new MemoryStore();
  await store.setJSON("definitions.json", [], {});
  await store.setJSON("state.json", {
    version: 2,
    occurrences: [{ id: "old", pulseId: "once", dueAt: "2026-08-20T09:00:00.000Z", state: "done", completedAt: "2026-08-20T09:01:00.000Z", seriesRevision: 4, ordinal: 1, final: true, titleSnapshot: "Old title" }],
    events: [],
  }, {});
  setPulseBlobStoreForTest(store);
  try {
    const created = await createPulseDefinition(onceDraft(), new Date("2026-08-27T12:00:00.000Z"));
    assert.equal(created.seriesRevision, 5);
    const state = await store.get("state.json") as { occurrences: Array<{ id: string; seriesRevision: number }> };
    assert.equal(state.occurrences.length, 2);
    assert.equal(state.occurrences.at(-1)?.seriesRevision, 5);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("once-to-recurring and recurring-to-once edits adopt active work instead of duplicating it", async () => {
  const store = new MemoryStore();
  const current = { ...onceDraft(), definitionRevision: 1, seriesRevision: 1 };
  await store.setJSON("definitions.json", [current], {});
  await store.setJSON("state.json", {
    version: 2,
    occurrences: [{ id: "active-original", pulseId: "once", dueAt: "2026-08-30T09:00:00.000Z", state: "due", seriesRevision: 1, ordinal: 1, final: true, titleSnapshot: "One-time reminder" }],
    events: [],
  }, {});
  setPulseBlobStoreForTest(store);
  try {
    const recurring = await updatePulseDefinition("once", {
      ...current,
      schedule: { version: 2, type: "daily", interval: 1, startDate: "2026-08-30", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 3 } },
    }, new Date("2026-08-30T09:01:00.000Z"));
    let state = await store.get("state.json") as { occurrences: Array<{ id: string; seriesRevision: number; ordinal: number; final: boolean }> };
    assert.deepEqual(state.occurrences, [{ id: "active-original", pulseId: "once", dueAt: "2026-08-30T09:00:00.000Z", state: "due", seriesRevision: 2, ordinal: 1, final: false, titleSnapshot: "One-time reminder" }]);

    await updatePulseDefinition("once", {
      ...recurring,
      schedule: { version: 2, type: "once", date: "2026-08-31", time: "09:00", timezone: "UTC" },
    }, new Date("2026-08-30T09:02:00.000Z"));
    state = await store.get("state.json") as typeof state;
    assert.deepEqual(state.occurrences.map(({ id, seriesRevision, ordinal, final }) => ({ id, seriesRevision, ordinal, final })), [
      { id: "active-original", seriesRevision: 3, ordinal: 1, final: true },
    ]);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("renewing a completed series atomically opens occurrence one of the new revision", async () => {
  const store = new MemoryStore();
  const current = {
    id: "renewable",
    title: "Renewable",
    active: true,
    definitionRevision: 1,
    seriesRevision: 1,
    schedule: { version: 2, type: "daily", interval: 1, startDate: "2026-08-20", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 2 } },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
  };
  const completed = [
    { id: "old-one", pulseId: "renewable", dueAt: "2026-08-20T09:00:00.000Z", state: "done", completedAt: "2026-08-20T09:01:00.000Z", seriesRevision: 1, ordinal: 1, final: false, titleSnapshot: "Renewable" },
    { id: "old-two", pulseId: "renewable", dueAt: "2026-08-21T09:00:00.000Z", state: "done", completedAt: "2026-08-21T09:01:00.000Z", seriesRevision: 1, ordinal: 2, final: true, titleSnapshot: "Renewable" },
  ];
  await store.setJSON("definitions.json", [current], {});
  await store.setJSON("state.json", { version: 2, occurrences: completed, events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    const renewed = await updatePulseDefinition("renewable", {
      ...current,
      schedule: { ...current.schedule, startDate: "2026-08-30" },
    }, new Date("2026-08-27T12:00:00.000Z"));
    assert.equal(renewed.seriesRevision, 2);
    const state = await store.get("state.json") as { occurrences: Array<{ id: string; state: string; seriesRevision: number; ordinal: number }> };
    assert.deepEqual(state.occurrences.slice(0, 2), completed);
    assert.deepEqual(state.occurrences.at(-1), {
      id: "renewable:s2:2026-08-30T09:00:00.000Z",
      pulseId: "renewable",
      dueAt: "2026-08-30T09:00:00.000Z",
      state: "scheduled",
      seriesRevision: 2,
      ordinal: 1,
      final: false,
      titleSnapshot: "Renewable",
    });
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("resuming a paused series atomically schedules the next future slot without backfilling paused cadence", async () => {
  const store = new MemoryStore();
  const paused = {
    id: "paused-series",
    title: "Paused series",
    active: false,
    definitionRevision: 2,
    seriesRevision: 1,
    schedule: { version: 2, type: "daily", interval: 1, startDate: "2026-08-20", time: "09:00", timezone: "UTC", end: { type: "count", occurrences: 3 } },
    notificationPolicy: { channels: ["ntfy"], repeatEveryMinutes: 5, snoozeEveryMinutes: 30 },
  };
  await store.setJSON("definitions.json", [paused], {});
  await store.setJSON("state.json", {
    version: 2,
    occurrences: [{ id: "completed-before-pause", pulseId: paused.id, dueAt: "2026-08-20T09:00:00.000Z", state: "done", completedAt: "2026-08-20T09:01:00.000Z", seriesRevision: 1, ordinal: 1, final: false, titleSnapshot: paused.title }],
    events: [],
  }, {});
  setPulseBlobStoreForTest(store);
  try {
    const resumed = await updatePulseDefinition(paused.id, { ...paused, active: true }, new Date("2026-08-27T12:00:00.000Z"));
    assert.equal(resumed.definitionRevision, 3);
    assert.equal(resumed.seriesRevision, 1);
    const state = await store.get("state.json") as { occurrences: Array<{ dueAt: string; ordinal: number; state: string }> };
    assert.deepEqual(state.occurrences.at(-1), {
      id: "paused-series:s1:2026-08-28T09:00:00.000Z",
      pulseId: "paused-series",
      dueAt: "2026-08-28T09:00:00.000Z",
      state: "scheduled",
      seriesRevision: 1,
      ordinal: 2,
      final: false,
      titleSnapshot: "Paused series",
    });
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("delete removes open work but retains completed titled history", async () => {
  const store = new MemoryStore();
  const sequenceId = ntfySequenceIdForOccurrence("open");
  await store.setJSON("definitions.json", [{ ...onceDraft(), definitionRevision: 1, seriesRevision: 1 }], {});
  await store.setJSON("state.json", {
    version: 2,
    occurrences: [
      { id: "open", pulseId: "once", dueAt: "2026-08-30T09:00:00.000Z", state: "scheduled", seriesRevision: 1, ordinal: 1, final: true, titleSnapshot: "One-time reminder" },
      { id: "done", pulseId: "once", dueAt: "2026-08-20T09:00:00.000Z", state: "done", completedAt: "2026-08-20T09:01:00.000Z", titleSnapshot: "One-time reminder" },
    ],
    events: [
      { id: "sent-open", pulseId: "once", occurrenceId: "open", type: "notification_sent", at: "2026-08-30T09:00:00.000Z", metadata: { channel: "ntfy", ok: true, sequenceId } },
    ],
  }, {});
  setPulseBlobStoreForTest(store);
  try {
    await deletePulseDefinition("once", new Date("2026-08-30T09:02:00.000Z"));
    const snapshot = await readPulseSnapshot();
    assert.deepEqual(snapshot.pulses, []);
    assert.deepEqual((snapshot.state as { occurrences: Array<{ id: string }> }).occurrences.map((value) => value.id), ["done"]);
    assert.equal("pendingNotificationSequenceCleanups" in snapshot.state, false);
    const persistedState = await store.get("state.json") as {
      pendingNotificationSequenceCleanups: Array<{ pulseId: string; occurrenceId: string; sequenceId: string; requestedAt: string; titleSnapshot: string }>;
    };
    assert.deepEqual(persistedState.pendingNotificationSequenceCleanups, [
      { pulseId: "once", occurrenceId: "open", sequenceId, requestedAt: "2026-08-30T09:02:00.000Z", titleSnapshot: "One-time reminder" },
    ]);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("delete rolls the definition back when open-occurrence persistence fails", async () => {
  const store = new MemoryStore();
  await store.setJSON("definitions.json", [{ ...onceDraft(), definitionRevision: 1, seriesRevision: 1 }], {});
  await store.setJSON("state.json", { version: 2, occurrences: [{ id: "open", pulseId: "once", dueAt: "2026-08-30T09:00:00.000Z", state: "scheduled", seriesRevision: 1, ordinal: 1, final: true, titleSnapshot: "One-time reminder" }], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.failStateWrite = true;
    await assert.rejects(deletePulseDefinition("once", new Date("2026-08-29T00:00:00.000Z")), /definitions were restored/);
    assert.equal((await store.get("definitions.json") as unknown[]).length, 1);
    assert.equal((await store.get("state.json") as { occurrences: unknown[] }).occurrences.length, 1);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("legacy recurrence migration commits all classifications and rolls definitions back if state fails", async () => {
  const store = new MemoryStore();
  const legacy = [{
    id: "legacy",
    title: "Legacy",
    active: true,
    schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:00", timezone: "UTC" },
  }];
  await store.setJSON("definitions.json", legacy, {});
  await store.setJSON("state.json", { version: 1, occurrences: [], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.failStateWrite = true;
    await assert.rejects(migratePulseRecurrence({ classifications: [{ id: "legacy", mode: "once" }] }, new Date("2026-08-27T12:00:00.000Z")), /original definitions were restored/);
    assert.deepEqual(await store.get("definitions.json"), legacy);

    const migrated = await migratePulseRecurrence({ classifications: [{ id: "legacy", mode: "repeat" }] }, new Date("2026-08-27T12:00:00.000Z"));
    assert.equal((migrated.state as { version: number }).version, 2);
    const retried = await migratePulseRecurrence({ classifications: [{ id: "legacy", mode: "repeat" }] }, new Date("2026-08-27T12:00:00.000Z"));
    assert.equal((retried.state as { version: number }).version, 2, "a lost success response can be retried safely");
    const snapshot = await readPulseSnapshot();
    assert.deepEqual(snapshot.recurrenceMigration, { required: false, legacyPulseIds: [] });
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("legacy recurrence migration reports rollback failure truthfully", async () => {
  const store = new MemoryStore();
  const legacy = [{
    id: "legacy",
    title: "Legacy",
    active: true,
    schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:00", timezone: "UTC" },
  }];
  await store.setJSON("definitions.json", legacy, {});
  await store.setJSON("state.json", { version: 1, occurrences: [], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.failStateWrite = true;
    store.definitionWritesUntilFailure = 2;
    await assert.rejects(
      migratePulseRecurrence({ classifications: [{ id: "legacy", mode: "once" }] }, new Date("2026-08-27T12:00:00.000Z")),
      /rollback failed.*may require repair/i,
    );
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});

test("legacy recurrence migration rolls definitions back when state persistence throws", async () => {
  const store = new MemoryStore();
  const legacy = [{
    id: "legacy",
    title: "Legacy",
    active: true,
    schedule: { type: "weekly", daysOfWeek: ["sunday"], time: "09:00", timezone: "UTC" },
  }];
  await store.setJSON("definitions.json", legacy, {});
  await store.setJSON("state.json", { version: 1, occurrences: [], events: [] }, {});
  setPulseBlobStoreForTest(store);
  try {
    store.throwStateWrite = true;
    await assert.rejects(
      migratePulseRecurrence({ classifications: [{ id: "legacy", mode: "once" }] }, new Date("2026-08-27T12:00:00.000Z")),
      /could not be saved.*original definitions were restored.*simulated state outage/i,
    );
    assert.deepEqual(await store.get("definitions.json"), legacy);
  } finally {
    setPulseBlobStoreForTest(undefined);
  }
});
