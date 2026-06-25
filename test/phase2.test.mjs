import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyOccurrenceAction,
  completeOccurrence,
  isOccurrenceDue,
  markOccurrenceDue,
} from "../dist/index.js";

function scheduledOccurrence(overrides = {}) {
  return {
    id: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    pulseId: "weekly-demo-check",
    dueAt: "2026-06-28T16:00:00.000Z",
    state: "scheduled",
    ...overrides,
  };
}

test("scheduled occurrence becomes due when dueAt is reached", () => {
  const occurrence = scheduledOccurrence();
  assert.equal(isOccurrenceDue(occurrence, new Date("2026-06-28T15:59:59.999Z")), false);
  assert.equal(isOccurrenceDue(occurrence, new Date("2026-06-28T16:00:00.000Z")), true);

  assert.deepEqual(markOccurrenceDue(occurrence, new Date("2026-06-28T16:00:00.000Z")), {
    ...occurrence,
    state: "due",
  });
});

test("scheduled occurrence does not become due before dueAt", () => {
  const occurrence = scheduledOccurrence();
  assert.equal(markOccurrenceDue(occurrence, new Date("2026-06-28T15:59:59.999Z")), occurrence);
});

test("due occurrence can be completed with a timestamp and note", () => {
  const occurrence = scheduledOccurrence({ state: "due" });
  assert.deepEqual(
    completeOccurrence(occurrence, {
      completedAt: new Date("2026-06-28T16:07:00.000Z"),
      completionNote: "Completed from test runner.",
    }),
    {
      ...occurrence,
      state: "done",
      completedAt: "2026-06-28T16:07:00.000Z",
      completionNote: "Completed from test runner.",
    },
  );
});

test("done occurrence cannot become due again", () => {
  const occurrence = scheduledOccurrence({
    state: "done",
    completedAt: "2026-06-28T16:07:00.000Z",
  });

  assert.throws(
    () => markOccurrenceDue(occurrence, new Date("2026-07-05T16:00:00.000Z")),
    /Done occurrences cannot become due again/,
  );
});

test("only due occurrences can be completed", () => {
  assert.throws(
    () => completeOccurrence(scheduledOccurrence(), { completedAt: new Date("2026-06-28T16:07:00.000Z") }),
    /Only due occurrences can be completed/,
  );
});

test("snooze, dismiss, skip, and seen actions are rejected", () => {
  const occurrence = scheduledOccurrence({ state: "due" });

  for (const action of ["snooze", "dismiss", "skip", "seen"]) {
    assert.throws(
      () => applyOccurrenceAction(occurrence, { type: action, at: new Date("2026-06-28T16:07:00.000Z") }),
      /Unsupported occurrence action/,
      `${action} should not be supported`,
    );
  }
});

test("done action is the only supported active escape hatch", () => {
  const occurrence = scheduledOccurrence({ state: "due" });

  assert.equal(
    applyOccurrenceAction(occurrence, {
      type: "done",
      at: new Date("2026-06-28T16:07:00.000Z"),
    }).completedAt,
    "2026-06-28T16:07:00.000Z",
  );
});
