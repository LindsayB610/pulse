import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  createPulseEvent,
  generateNextOccurrence,
  generateOccurrences,
  loadPulseDefinitionsFromYaml,
  parsePulseDefinitions,
} from "../dist/index.js";

const root = new URL("../", import.meta.url).pathname;

test("weekly Sunday 9am schedule generates the expected occurrence in UTC", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "weekly-demo-check",
      title: "Weekly demo check",
      active: true,
      schedule: {
        type: "weekly",
        daysOfWeek: ["sunday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);

  const occurrence = generateNextOccurrence(pulse, {
    after: new Date("2026-06-25T12:00:00.000Z"),
  });

  assert.equal(occurrence?.pulseId, "weekly-demo-check");
  assert.equal(occurrence?.dueAt, "2026-06-28T16:00:00.000Z");
  assert.equal(occurrence?.state, "scheduled");
  assert.equal(occurrence?.id, "weekly-demo-check:2026-06-28T16:00:00.000Z");
});

test("timezone is preserved on parsed pulse definitions", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "timezone-check",
      title: "Timezone check",
      active: true,
      schedule: {
        type: "weekly",
        daysOfWeek: ["sunday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);

  assert.equal(pulse.schedule.timezone, "America/Los_Angeles");
});

test("inactive pulses do not generate occurrences", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "inactive-check",
      title: "Inactive check",
      active: false,
      schedule: {
        type: "weekly",
        daysOfWeek: ["sunday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);

  assert.equal(generateNextOccurrence(pulse, { after: new Date("2026-06-25T12:00:00.000Z") }), null);
});

test("generated occurrences are stable and not duplicated", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "stable-check",
      title: "Stable check",
      active: true,
      schedule: {
        type: "weekly",
        daysOfWeek: ["sunday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);
  const after = new Date("2026-06-25T12:00:00.000Z");
  const first = generateNextOccurrence(pulse, { after });
  const second = generateNextOccurrence(pulse, { after });

  assert.deepEqual(first, second);
  assert.equal(
    generateNextOccurrence(pulse, { after, existingOccurrences: first ? [first] : [] })?.dueAt,
    "2026-07-05T16:00:00.000Z",
  );
});

test("multiple weekly days choose the next matching local day", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "multi-day-check",
      title: "Multi-day check",
      active: true,
      schedule: {
        type: "weekly",
        daysOfWeek: ["monday", "wednesday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);

  assert.equal(
    generateNextOccurrence(pulse, { after: new Date("2026-06-25T12:00:00.000Z") })?.dueAt,
    "2026-06-29T16:00:00.000Z",
  );
});

test("exact scheduled local time advances to the next weekly occurrence", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "exact-time-check",
      title: "Exact time check",
      active: true,
      schedule: {
        type: "weekly",
        daysOfWeek: ["sunday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);

  assert.equal(
    generateNextOccurrence(pulse, { after: new Date("2026-06-28T16:00:00.000Z") })?.dueAt,
    "2026-07-05T16:00:00.000Z",
  );
});

test("weekly schedule respects daylight saving transitions", () => {
  const [pulse] = parsePulseDefinitions([
    {
      id: "dst-check",
      title: "DST check",
      active: true,
      schedule: {
        type: "weekly",
        daysOfWeek: ["sunday"],
        time: "09:00",
        timezone: "America/Los_Angeles",
      },
    },
  ]);

  assert.equal(
    generateNextOccurrence(pulse, { after: new Date("2026-03-01T18:00:00.000Z") })?.dueAt,
    "2026-03-08T16:00:00.000Z",
  );
  assert.equal(
    generateNextOccurrence(pulse, { after: new Date("2026-10-25T17:00:00.000Z") })?.dueAt,
    "2026-11-01T17:00:00.000Z",
  );
});

test("invalid schedule fields fail loudly", () => {
  assert.throws(
    () =>
      parsePulseDefinitions([
        {
          id: "bad-time",
          title: "Bad time",
          active: true,
          schedule: {
            type: "weekly",
            daysOfWeek: ["sunday"],
            time: "25:00",
            timezone: "America/Los_Angeles",
          },
        },
      ]),
    /time is out of range/,
  );
  assert.throws(
    () =>
      parsePulseDefinitions([
        {
          id: "bad-day",
          title: "Bad day",
          active: true,
          schedule: {
            type: "weekly",
            daysOfWeek: ["funday"],
            time: "09:00",
            timezone: "America/Los_Angeles",
          },
        },
      ]),
    /Unsupported day of week/,
  );
  assert.throws(
    () =>
      parsePulseDefinitions([
        {
          id: "bad-zone",
          title: "Bad zone",
          active: true,
          schedule: {
            type: "weekly",
            daysOfWeek: ["sunday"],
            time: "09:00",
            timezone: "Not/AZone",
          },
        },
      ]),
    /Invalid time zone specified/,
  );
});

test("example pulse fixture parses as a valid weekly pulse", () => {
  const yaml = readFileSync(join(root, "pulses.example.yaml"), "utf8");
  const pulses = loadPulseDefinitionsFromYaml(yaml);
  const occurrences = generateOccurrences(pulses, {
    after: new Date("2026-06-25T12:00:00.000Z"),
  });

  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].id, "weekly-demo-check");
  assert.equal(pulses[0].schedule.type, "weekly");
  assert.deepEqual(pulses[0].schedule.daysOfWeek, ["sunday"]);
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0].dueAt, "2026-06-28T16:00:00.000Z");
});

test("event log primitives create durable occurrence events", () => {
  const event = createPulseEvent({
    pulseId: "weekly-demo-check",
    occurrenceId: "weekly-demo-check:2026-06-28T16:00:00.000Z",
    type: "occurrence_scheduled",
    at: new Date("2026-06-25T12:00:00.000Z"),
    metadata: { dueAt: "2026-06-28T16:00:00.000Z" },
  });

  assert.equal(event.id, "evt:weekly-demo-check:2026-06-28T16:00:00.000Z:occurrence_scheduled:2026-06-25T12:00:00.000Z");
  assert.equal(event.at, "2026-06-25T12:00:00.000Z");
  assert.deepEqual(event.metadata, { dueAt: "2026-06-28T16:00:00.000Z" });
});
