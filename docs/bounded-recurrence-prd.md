# Pulse Bounded Recurrence

## Product Requirements, Experience Design, and TDD Workplan

**Status:** Feature implementation and local verification complete. Production
owner migration and release proof remain.

**Date:** 2026-08-27

**Feature owner:** Pulse owns the schedule model, runner behavior, cloud API,
plugin UI, migration, notification language, tests, and documentation.
Workshop remains the desktop host and must not gain Pulse-specific recurrence
logic or UI.

## Executive decision

New Pulse reminders run **once by default**. A person must explicitly enable
**Repeat this reminder** to create a recurring series. Every recurring series
has a required, finite end expressed as either a number of occurrences or an
inclusive local end date. Pulse does not offer `Never`.

The recurrence editor uses progressive disclosure inside the existing Pulse
reminder form. The ordinary one-time path stays short. Enabling recurrence
reveals calendar-style frequency, interval, conditional cadence controls, a
required end rule, a readable summary, and a preview of upcoming dates.

Pulse supports one-time, daily, weekly, monthly, and yearly schedules. It
continues to allow only one open occurrence per reminder. A due or snoozed
occurrence remains active until Done; future cadence slots never create a
backlog behind it.

The implementation is a durable model migration, not a UI-only patch. Existing
weekly reminders cannot be classified safely from their data, so the upgrade
includes an atomic migration screen where the owner marks each legacy reminder
as **Runs once** or **Repeats** before the new schema replaces the old one.

## Why this feature exists

The current product has a functional defect disguised as a missing control:

- the editor exposes a weekday and time but no recurrence choice;
- `pulseDefinitionFromForm` always serializes `schedule.type = "weekly"`;
- the engine supports only weekly schedules; and
- weekly recurrence has no end.

A person creating a reminder for later today is therefore creating an
unbounded weekly series without being told. The list then presents that hidden
decision as ordinary schedule text. This violates product truth and makes a
safe one-time reminder impossible.

## Self-review of the proposed direction

The first proposal established the right interaction direction but left five
implementation traps. This PRD resolves them before code begins.

| Finding | Classification | Resolution |
| --- | --- | --- |
| Preserving legacy weekly behavior indefinitely would violate the bounded-series promise. | Defect | Use an all-or-nothing migration transaction. Old delivery continues until the owner classifies every legacy definition; schema v2 is not activated partially. |
| “30 occurrences” was ambiguous for schedules with multiple weekdays. | Clarification | Each generated obligation is one occurrence. Monday and Wednesday consume two occurrences per week when both can be generated. |
| A long-running due occurrence could allow future cadence slots to become a backlog. | Defect | Pulse retains one open obligation. Cadence slots that pass while one is open do not queue and do not consume a count-based series occurrence. |
| Monthly dates such as the 29th–31st and yearly February 29 were unspecified. | Clarification | The editor exposes explicit skip/last-day behavior for late-month schedules. February 29 yearly schedules occur only in leap years and say so in the summary. |
| Editing a live series could corrupt progress or let old history exhaust a new schedule. | Defect | Schedule/end changes create a server-owned series revision. Current due/snoozed work is preserved; old history never counts against the new revision. |

After those corrections, the product, interaction, and production-proof gates
are decision-ready. Visual approval still requires the coded prototype in B4;
this document does not claim that prose is visual evidence.

## Product contract

### User and job

The primary user manages Pulse inside Workshop on a Mac laptop. They want to
schedule one obligation or a finite series, understand exactly what will
happen, and trust that persistent Android follow-up will stop only when the
active occurrence is Done.

Their job is:

> Tell Pulse when this obligation should first happen, whether it should happen
> again, and exactly when the series should stop—without translating calendar
> rules or discovering a hidden recurrence later.

### Primary and secondary environments

- **Primary management surface:** the Pulse plugin embedded in Workshop on
  macOS, normally at a 1280–1440px-wide laptop window with pointer and keyboard.
- **Delivery and acknowledgement surface:** Android notifications through ntfy.
- **Secondary management surface:** a narrow Workshop window. It must reflow
  without changing the task hierarchy.
- **Cloud execution:** the user's private compatible runner. The first supported
  production adapter is Netlify with private Netlify Blobs state.

### Ownership and source of truth

| Concern | Owner | Rule |
| --- | --- | --- |
| Recurrence editor, summaries, progress, migration, and renewal UI | Pulse plugin | Remains independently buildable, scoped, theme-inheriting, and usable with standalone fallbacks. |
| Canonical definitions, series revisions, occurrences, and history | Private Pulse runner | Cloud state is authoritative; the plugin never invents saved recurrence progress. |
| Schedule generation and lifecycle | Pulse engine | Shared deterministic rules are used by local and Netlify runners. |
| Done and Snooze | Android notification actions | Workshop does not gain occurrence acknowledgement controls. |
| Secure transport and credentials | Existing Workshop generic secure-service boundary | No recurrence change exposes tokens, topics, private keys, or runner credentials. |
| Private reminder content | User-owned runner/private store | No real title, date, schedule, history, endpoint, or credential enters the public repository. |

### Delivery horizon

This is a durable foundation. The model, migrations, APIs, persistence, and
tests must support future Pulse releases without rewriting existing series.
Prototype-only recurrence state or client-derived counters are unacceptable.

### Success test

A person can:

1. create a reminder for one date and time without enabling recurrence;
2. explicitly create a finite daily, weekly, monthly, or yearly series;
3. understand the cadence, next occurrence, remaining count, and ending before
   saving;
4. edit cadence or end rules without losing history or duplicating active work;
5. see clear warnings as a series approaches its final occurrence;
6. complete the final occurrence from Android and receive nothing further;
7. renew a completed series through one obvious action; and
8. migrate existing weekly reminders without missed delivery, guessed intent,
   partial writes, or private data leakage.

### Non-goals

This feature does not add:

- infinite recurrence;
- per-occurrence exceptions, skip dates, holidays, or exclusions;
- editing “only this occurrence” versus “the whole series”;
- natural-language schedule entry;
- calendar import, synchronization, invitations, or attendee concepts;
- all-day or multi-day reminders;
- phone-side schedule management;
- multiple concurrent open occurrences for one reminder;
- a Workshop source change or Workshop-specific recurrence dependency;
- a new notification provider; or
- analytics collection.

## Terminology

Pulse currently uses “repeat” for more than one behavior. The product and code
must separate them.

| Term | Meaning |
| --- | --- |
| **Recurrence** | Creation of a future occurrence after the active one is Done. |
| **Series** | One versioned, bounded recurrence definition and its occurrences. |
| **Occurrence** | One obligation that can become due, notify, snooze, and become Done. |
| **Follow-up** | Re-notification for the same open occurrence after Snooze or two minutes of no action. |
| **Delivery retry** | System-owned five-minute retry after a provider delivery failure. Not a user recurrence setting. |

User-facing copy uses **Repeat this reminder**, **Snooze or no action**, and
**Delivery retry** only in their respective contexts. The legacy serialized
`repeatEveryMinutes` compatibility field must not become the recurrence API.

## Reference behavior and design directions

Google Calendar and Google Tasks establish the familiar `Does not repeat` /
frequency / custom / end-by-count-or-date model. Google Calendar caps a series
at 730 occurrences. Apple Calendar exposes frequency-specific custom rules and
an explicit End Repeat choice. Pulse borrows those comprehension patterns, not
their visual styling or unlimited-calendar scope:

- [Google Calendar repeating events](https://support.google.com/calendar/answer/37115)
- [Google Tasks repeating tasks](https://support.google.com/calendar/answer/12132599)
- [Apple Calendar repeating events](https://support.apple.com/en-is/guide/calendar/icl1018/mac)

Three directions were evaluated.

| Criterion | A — Inline checkbox and progressive panel | B — Always-visible recurrence selector | C — Separate recurrence dialog |
| --- | --- | --- | --- |
| One-time clarity | Excellent; recurrence is off by default | Weak; cadence is visually overrepresented | Good |
| Desktop composition | Strong; uses form width without leaving context | Dense and calendar-like | Adds context switching |
| Scanability | Strong | Medium | Medium |
| Complex-rule scalability | Strong through conditional fields | Strong but noisy | Strong |
| Keyboard/accessibility risk | Low | Low | Higher focus and modal-state burden |
| Implementation risk | Moderate | Moderate | Higher |

**Chosen direction: A.** It gives the common one-time job the shortest path,
keeps the current editor calm, and exposes serious recurrence controls only
after intent is explicit. A component library is not required; Pulse's existing
scoped controls and semantic host-token fallbacks are sufficient.

## Experience design

### Default one-time form

The schedule section begins with real date and time controls:

```text
Date          [ Aug 27, 2026 ]
Time          [ 4:30 PM      ]

☐ Repeat this reminder
  Off: Pulse runs once, then moves it to Finished and remains in History.
```

Rules:

- `Repeat this reminder` is unchecked for every new reminder.
- Date uses a Pulse-owned desktop calendar rather than relying on the embedded
  browser's inconsistent native picker. The entire field opens the calendar;
  the selected date is written in plain language; previous month, next month,
  Today, and direct month/year selection are explicit controls; and arrow keys,
  Home/End, Page Up/Page Down, Enter, and Escape provide complete keyboard
  operation.
- Date defaults to today only when the selected local time is still in the
  future; otherwise it defaults to tomorrow.
- Past days are unavailable for a new reminder. Existing schedules may retain
  and display their historical start date while being edited.
- Timezone defaults to the Mac's resolved IANA timezone and remains visible in
  the schedule section, not buried behind recurrence.
- A one-time date/time must be in the future at save time.
- Saving produces one occurrence. Done completes it permanently.

### Recurrence panel

Checking `Repeat this reminder` expands an inline panel immediately after the
date and time. Focus remains on the checkbox; screen readers receive the
expanded state and the new region has a labelled heading.

```text
☑ Repeat this reminder

Repeats       [ Weekly ▼ ]
Every         [ 1 ] week
On            S  M  T  W  T  F  S

Ends          ● After [ 30 ] reminders
              ○ On [ Mar 28, 2027 ]

Every Sunday at 8:50 AM
30 reminders · Sep 6, 2026–Mar 28, 2027

Next: Sep 6 · Sep 13 · Sep 20
```

The preview assumes each occurrence is completed before the next scheduled
time. The UI states that assumption when an interval is shorter than the
configured Snooze/no-action duration.

### Frequency controls

#### Daily

- `Every [1] day`, with an interval of 1–365.
- An **Every weekday** preset serializes as weekly Monday–Friday, not as a
  special daily exception.

#### Weekly

- `Every [1] week`, with an interval of 1–52.
- Seven toggle buttons allow one or more weekdays.
- The weekday matching the selected start date is selected initially.
- The saved schedule includes `weekStartsOn`, derived from the user's locale at
  creation and then stored canonically. Multi-week intervals are anchored to
  the week containing `startDate`; selected days before `startDate` in the
  first recurrence week are not eligible.
- Each generated weekday is one occurrence. A Monday/Wednesday series with an
  end count of 30 produces at most 30 obligations, not 30 weeks.

#### Monthly

- `Every [1] month`, with an interval of 1–60.
- The editor offers rules derived from the selected start date:
  - `On day 15`;
  - `On the third Sunday`; or
  - where applicable, `On the last day of the month`.
- For days 29–31, choosing the exact calendar date explicitly says that months
  without that date are skipped. Choosing last day never silently changes an
  exact-date rule.
- A fifth-weekday rule skips months without a fifth matching weekday. The
  summary says so.

#### Yearly

- `Every [1] year`, with an interval of 1–5.
- Month and day come from the selected start date and remain editable.
- February 29 occurs only in leap years. Pulse does not silently move it to
  February 28 or March 1.

#### Timezone and daylight-saving behavior

- Schedule dates and times are interpreted in the saved IANA timezone. Moving
  the Mac or phone does not move the reminder.
- If a requested local time does not exist during the spring-forward gap,
  Pulse moves that occurrence forward by the exact gap on the same local date
  (for example, 2:30 becomes 3:30 when the gap is one hour). It does not skip an
  obligation silently.
- If a local time occurs twice during fall-back, Pulse uses the earlier instant.
- The schedule summary and preview display the resolved local result when an
  entered date is affected by a daylight-saving transition.

### Required end rule

Recurring series offer exactly two end modes:

- **After N reminders** — counts generated occurrences. An existing open
  occurrence counts only when it is explicitly adopted as occurrence 1 of the
  new series during legacy migration or a once-to-recurring conversion. A due
  occurrence preserved under an older series revision does not consume the new
  series count.
- **On date** — inclusive in the schedule's local timezone. An occurrence at
  any valid time on that local date is eligible; no new occurrence is created
  afterward.

There is no `Never` choice.

Recommended defaults:

| Frequency | Default occurrence count |
| --- | ---: |
| Daily | 30 |
| Weekly | 30 |
| Monthly | 12 |
| Yearly | 5 |

Every series is additionally limited to 365 generated occurrences and a
five-year local-date horizon, whichever is reached first. The UI prevents an
invalid save and explains the applicable limit beside the field. Date-ending
series show the calculated occurrence total before save.

### Reminder cards

The Reminders route must distinguish schedule and lifecycle without badges
breeding across the screen.

Examples:

- `Once · Thu, Aug 27 at 4:30 PM`
- `Weekly on Sunday at 8:50 AM · 18 of 30 remaining`
- `Monthly on the last day · ends Dec 31, 2027`

Lifecycle language:

| State | Card treatment | Primary management action |
| --- | --- | --- |
| Active one-time | Normal card; next notification visible | Edit |
| Active recurring | Normal card; remaining count/end visible | Edit |
| Three remaining | Quiet `3 remaining` warning in schedule metadata | Edit |
| Final open occurrence | `Final reminder` status | Edit |
| Paused | Existing paused treatment; remaining count unchanged | Resume |
| One-time complete | Moves out of the active list into Finished and History | Schedule again |
| Series complete | Finished section; no next occurrence | Add another set |

The active summary count excludes completed one-time reminders and completed
series. The next-notification summary derives only from open occurrences.

### Finished and renewal

Completed one-time reminders and exhausted series remain in a collapsed
**Finished** section so their definitions and titles remain intelligible. Full
occurrence evidence remains in History.

- **Schedule again** opens a one-time editor prefilled with the prior title,
  time, timezone, Snooze/no-action policy, and a new future date.
- **Add another set** opens a compact confirmation/editor prefilled with the
  prior cadence and the recommended batch for that frequency.
- Saving creates a new server-owned series revision. It does not alter prior
  history.
- Renewal is never automatic.

### Delete behavior

Deleting a reminder is an owner-level destructive action distinct from Done.
It requires confirmation that names the reminder and states that no future
notification will be sent.

- Definition deletion and removal of any non-done occurrence are atomic.
- If the occurrence already has an ntfy sequence, cleanup is attempted and
  retried durably on failure.
- Completed history remains and retains a title snapshot even after the
  definition is gone.
- Delete never renews, reschedules, or silently converts a series.

### Android notification warnings

Notification actions remain Done and duration-aware Snooze. Recurrence adds
context without adding another action:

- count-ending series say when three, two, or one occurrences remain;
- date-ending series say `Series ends [date]` near the end rather than claiming
  a count that could change while an occurrence remains open;
- the final occurrence says `Final reminder in this series`;
- every notification in the final occurrence's ntfy chain retains that final
  language through Snooze or automatic no-action follow-up; and
- Done on the final occurrence completes the series and triggers the existing
  sequence cleanup.

### Editing behavior

| Change | Consequence |
| --- | --- |
| Title, instructions, or Snooze/no-action timing | Keeps the current series revision and progress. Future notifications use the new values. |
| Future one-time date/time | Replaces the untouched scheduled occurrence atomically. |
| Recurrence cadence, start, or end | Creates a new series revision after confirmation. Old completed history is preserved. |
| Recurring → once | The current open occurrence becomes final. If no occurrence is open, the editor requires a future date/time. |
| Once → recurring | The one-time occurrence becomes occurrence 1 of the new series when it is still open. |
| Change while due or snoozed | The current occurrence remains due/snoozed with its existing due identity. New cadence begins only after it is Done. |
| Change while an untouched future occurrence exists | Replaces that scheduled occurrence with occurrence 1 of the new series. |

Before a series-changing save, the editor presents a concise consequence
summary such as: `The reminder currently due stays active. The new weekly
schedule begins after you mark it Done.`

### Pause behavior

- Pause prevents generation of future occurrences and does not consume a
  count-based series occurrence while paused.
- An already due or snoozed occurrence remains active until Done; Pause is not
  a phone acknowledgement escape hatch.
- Resume schedules the next future eligible occurrence. It does not create a
  backlog for cadence slots that passed while paused.
- If a date-ending series expires while paused, Resume is replaced by
  **Add another set**.

### Runner downtime and missed cadence

Pulse never emits a backlog storm.

- If no occurrence is open when the runner returns, it creates one catch-up
  occurrence for the most recent eligible cadence slot.
- Older elapsed slots are not materialized and do not consume a count-based
  occurrence limit.
- If an occurrence was already open, it remains the only obligation. Cadence
  slots that pass while it is due or snoozed do not queue.
- Date-based series create no new occurrence after the inclusive local end
  date, but an occurrence opened before the end remains completable afterward.
- Count-based series may extend beyond the previewed calendar ending when an
  occurrence remains open, the runner is unavailable, or the reminder is
  paused. The count still describes actual obligations generated.
- For a date-ending series, `final` is recalculated by the runner as time
  advances. An occurrence can become the final occurrence when all later
  eligible slots pass while it remains open.

## Workflow and state matrix

| Job | Entry | Success | In progress | Failure | Recovery | Persisted consequence |
| --- | --- | --- | --- | --- | --- | --- |
| Create once | New reminder | One future occurrence shown | Saving | Invalid/past date or service rejection | Draft remains; correct or retry | One v2 definition and occurrence |
| Create recurring | Enable Repeat | Summary, preview, and remaining count shown | Calculating/saving | Invalid rule, over limit, or service rejection | Fields and draft remain | New series revision and occurrence 1 |
| Edit non-series fields | Edit | Card and future notification copy update | Saving | Conflict/service rejection | Refresh canonical data without discarding draft | Same series revision |
| Edit series | Edit recurrence | Consequence confirmed and new summary shown | Saving | Conflict/invalid rule | Keep draft; reload canonical progress; retry | New series revision; old history retained |
| Pause/resume | Reminder card | State and next occurrence update truthfully | Mutating | Service rejection | Keep prior visible state; retry | Generation frozen/resumed |
| Complete final occurrence | Android Done | Series becomes complete; chain clears | Cleanup pending | ntfy cleanup failure | Durable retry; completion remains final | No future occurrence |
| Renew | Finished card | New bounded set shown | Saving | Conflict/service rejection | Prior completed series remains unchanged | New series revision |
| Delete | Reminder action | Reminder leaves active/finished lists and its ntfy chain clears | Deleting/cleanup pending | Storage or cleanup failure | Definition/state write rolls back; cleanup retries after durable deletion | No open or future occurrence; completed history remains |
| Migrate legacy reminders | Migration gate | Every definition classified and v2 activated | Validating/committing | Any invalid choice or write failure | Entire legacy state remains active; retry | Atomic schema/definition/state migration |
| Runner downtime | Automatic | At most one catch-up obligation | Runner stale | Runner unavailable | Existing health recovery | No backlog or duplicate occurrences |

Loading, error, stale-runner, offline, and disconnected states reuse Pulse's
existing management shell. Recurrence controls never render as saved until the
authoritative runner response succeeds.

## Canonical data contract

The exact TypeScript names may be refined during B0, but the discriminated
shape and behavior are fixed by this PRD.

```ts
type RecurrenceEnd =
  | { type: "count"; occurrences: number }
  | { type: "date"; date: string }; // YYYY-MM-DD, inclusive locally

type OnceSchedule = {
  version: 2;
  type: "once";
  date: string;
  time: string;
  timezone: string;
};

type DailySchedule = {
  version: 2;
  type: "daily";
  interval: number;
  startDate: string;
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

type WeeklySchedule = {
  version: 2;
  type: "weekly";
  interval: number;
  startDate: string;
  weekStartsOn: DayOfWeek;
  daysOfWeek: DayOfWeek[];
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

type MonthlySchedule = {
  version: 2;
  type: "monthly";
  interval: number;
  startDate: string;
  rule:
    | { type: "dayOfMonth"; day: number; missingDate: "skip" | "lastDay" }
    | { type: "nthWeekday"; ordinal: 1 | 2 | 3 | 4 | 5 | "last"; day: DayOfWeek };
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};

type YearlySchedule = {
  version: 2;
  type: "yearly";
  interval: number;
  startDate: string;
  month: number;
  day: number;
  missingDate: "skip";
  time: string;
  timezone: string;
  end: RecurrenceEnd;
};
```

Canonical definitions add server-managed revision metadata:

```ts
type PulseDefinition = {
  // existing fields
  definitionRevision: number;
  seriesRevision: number;
  schedule: PulseScheduleV2;
};

type PulseOccurrence = {
  // existing fields
  seriesRevision: number;
  ordinal: number;
  final: boolean;
  titleSnapshot: string;
};

type SeriesProgress = {
  generated: number;
  remaining?: number; // count-ending series only
  endsOn?: string; // date-ending series only
  complete: boolean;
};
```

Rules:

- the runner, not the plugin, assigns and increments revisions;
- non-series edits increment `definitionRevision` only;
- cadence/end changes increment both revisions;
- occurrence identity includes the series revision and due instant;
- occurrence ordinals are monotonically increasing within a series revision;
- series progress is returned canonically in snapshots; count-ending series
  expose `remaining`, while date-ending series expose `endsOn` instead of a
  brittle planned-remaining count;
- `final` may be updated while an occurrence remains open when a date-ending
  series has no later eligible slot;
- `titleSnapshot` keeps completed history intelligible after deletion;
- a stale mutation returns `409 Conflict` with current redacted definition
  metadata; and
- writes involving definitions and the currently scheduled untouched
  occurrence happen under the existing private-store lock.

## API and persistence changes

- `POST /api/v1/pulses` accepts only schedule v2 after migration and returns the
  canonical saved definition plus derived next occurrence.
- `PATCH /api/v1/pulses/:id` requires the last observed definition revision.
- Snapshot responses include canonical schedule, series progress, lifecycle,
  and migration status; the plugin does not derive persistence truth from its
  draft.
- Migration receives all legacy classifications in one request and commits
  definitions, open occurrences, and schema version atomically.
- Deletion commits the definition and open-occurrence removal atomically and
  records enough cleanup state to retry an ntfy sequence deletion.
- Netlify Blobs and the local JSON store use the same parser and migration
  contract.
- Backups and exports retain schema version, series revisions, ordinals, and
  prior occurrence history.
- Imports reject unbounded v2 recurrence, invalid timezones, impossible local
  dates, invalid intervals, limits above the cap, and inconsistent series
  metadata.

No endpoint accepts or returns ntfy tokens, topics, setup keys, private runner
credentials, or Workshop Keychain values as part of recurrence.

## Legacy migration contract

All current production definitions are weekly and unbounded. Intent cannot be
inferred from that shape.

### Entry

When the plugin reads schema v1 definitions from a recurrence-capable runner,
the Reminders route shows **Finish updating your reminder schedules** before
the ordinary creator. Existing cloud delivery continues under the old schema
while the migration draft is incomplete.

### Classification

Each legacy definition shows its title, existing weekday/time/timezone, and
current open occurrence. The owner chooses:

- **Runs once** — retain the current open occurrence as the only/final
  occurrence, or create one next occurrence when none exists; or
- **Repeats** — prefill weekly interval 1, the existing weekdays/time/timezone,
  and 30 occurrences including any current open occurrence.

The owner may edit the recommended recurring end before committing.

### Atomicity

- No definition is written until every legacy reminder has a valid choice.
- A failed validation, conflict, disconnect, or storage write leaves the entire
  v1 definition and state set unchanged.
- The runner continues the v1 behavior until the atomic commit succeeds.
- After success, schema v2 rejects creation of unbounded definitions.
- The release migration gate is not complete until the production owner has
  classified every existing reminder and verified the next occurrence.

This temporary compatibility window protects delivery without pretending that
legacy infinity satisfies the new product contract.

## Accessibility and interaction requirements

- The recurrence checkbox is a native labelled checkbox with `aria-expanded`
  and `aria-controls` for the conditional panel.
- Weekday controls expose full weekday names and `aria-pressed`; visual initials
  are not their accessible names.
- Radio groups for end mode and monthly rule use fieldset/legend semantics.
- Summaries and previews update in a polite live region without announcing on
  every keystroke; updates are debounced until a parseable value exists.
- Validation is both field-specific and summarized at save. Focus moves to the
  first invalid field after submission.
- The series-change confirmation traps focus, supports Escape, restores focus,
  and leaves the draft intact when cancelled.
- Saving, conflicts, migration progress, and renewal results are exposed as
  status or alert regions as appropriate.
- Every control works by keyboard at desktop and at 200% zoom. No recurrence
  row requires horizontal scrolling.
- Color never carries remaining/final/complete state alone.

## TDD operating rule

Every implementation phase follows red → green → refactor:

1. Write the smallest failing contract for the phase behavior.
2. Run it and record the intended failure.
3. Implement only enough production behavior to satisfy the contract.
4. Refactor with the focused suite green.
5. Run the phase suite plus all earlier recurrence suites.
6. Inspect the real rendered state when the phase changes UI.
7. Do not call the phase complete until its clean-consumer and public-boundary
   obligations also pass.

Discovered defects receive a failing regression test at the layer where they
escaped before the fix. Snapshot-only tests do not substitute for mounted
interaction tests.

## Implementation phases

### B0 — Freeze contracts and fixtures

**Outcome:** schedule v2, series lifecycle, limits, migration input/output, and
public-safe fixtures are executable before the engine changes.

Write first:

- type/parser tests for every schedule union member and end mode;
- rejection tests for unbounded recurrence, invalid intervals, invalid dates,
  invalid timezones, excessive totals/horizons, empty weekdays, and inconsistent
  monthly rules;
- fixture tests covering once, daily, multi-day weekly, late-month monthly,
  nth-weekday monthly, yearly, final, complete, and legacy states; and
- source-boundary tests proving no private production definition enters the
  repository.

Gate: no implementation proceeds while count, end-date inclusivity, series
revision, or missed-cadence semantics remain ambiguous.

### B1 — Deterministic schedule engine

**Outcome:** the engine produces the correct next eligible local occurrence
for every schedule type without duplicates or unbounded search.

Write first:

- one-time generation and past-time rejection;
- daily and interval boundaries;
- weekly multi-day ordering and interval anchoring;
- stored week-start anchoring across locales;
- monthly 29/30/31 skip versus last-day behavior;
- first through fifth/last weekday rules;
- yearly February 29 behavior;
- DST spring-forward and fall-back behavior in multiple IANA zones;
- exact spring-gap advancement and earlier fall-back instant selection;
- count and inclusive-date termination;
- 365-occurrence/five-year limits;
- stable IDs, ordinals, canonical progress, and final flags; and
- preview generation using the same engine as production.

Gate: property-style tests verify generated instants are strictly increasing,
bounded, timezone-valid, and duplicate-free.

### B2 — Runner lifecycle and notification semantics

**Outcome:** the runner honors bounded series while preserving Pulse's
one-open-occurrence, Done, Snooze, no-action, retry, and cleanup behavior.

Write first:

- no next occurrence after a one-time Done;
- no next occurrence after count/date exhaustion;
- one open occurrence despite multiple elapsed cadence slots;
- one most-recent catch-up occurrence after downtime;
- pause/resume without count consumption or backlog;
- active due/snoozed preservation across a series edit;
- untouched future-occurrence replacement;
- three/two/final notification payload wording;
- final Done cleanup and durable cleanup retry;
- renewal creating a new series revision without altering old history; and
- deletion atomically ending an open series, retaining titled history, and
  retrying notification-chain cleanup.

Gate: fake-clock end-to-end runner tests cover due → notify → snooze/no action →
Done → next/final/stop for every frequency.

### B3 — Persistence, API, and migration

**Outcome:** local and Netlify runners store and mutate recurrence atomically.

Write first:

- v2 JSON/YAML round trips;
- backup/export/import round trips;
- optimistic-revision success and `409` conflict;
- atomic definition plus occurrence reconciliation;
- atomic definition/open-occurrence deletion with durable cleanup metadata;
- complete legacy classification migration;
- rollback on one invalid classification or storage failure;
- idempotent migration retry;
- concurrent runner/API mutation under the existing lock; and
- rejection of secret-bearing or malformed recurrence records.

Gate: a v1 production-shaped fixture migrates to v2, preserves due/snoozed and
completed history, and produces the expected next occurrence after reload.

### B4 — Coded product prototype

**Outcome:** the complete recurrence experience is proven visually and
interactively in Pulse's real desktop context before production promotion.

Prototype states:

1. default one-time creator;
2. daily recurrence;
3. weekly multi-day recurrence;
4. monthly exact-date and ordinal rules;
5. required count/date ending and limit validation;
6. readable summary and three-date preview;
7. editing with an active due occurrence;
8. three remaining, final, complete, and renewal cards;
9. migration with mixed Runs once / Repeats choices;
10. save failure, conflict, stale runner, and invalid local date;
11. desktop primary viewport, narrow reflow, and 200% zoom; and
12. representative inherited Workshop palette plus standalone fallback.

Gate: run product/function, visual/interaction, and production-proof reviews
separately. Repair findings and repeat the render. Attractive default-state
screens do not pass this phase alone.

### B5 — Production plugin UI

**Outcome:** Pulse exposes the complete engine capability through the existing
Pulse-owned management surface.

Write first:

- mounted creation workflow proving Repeat is unchecked by default;
- progressive disclosure and keyboard semantics;
- each frequency's conditional controls and serialization;
- summary/preview parity with the engine;
- draft preservation across validation, service failure, and `409` conflict;
- series-change consequence confirmation;
- card progress/final/complete states;
- Finished section and renewal;
- named delete confirmation, cleanup-pending feedback, and retained history;
- atomic migration workflow; and
- axe, focus, zoom, overflow, inherited-theme, and standalone render tests.

Gate: create once, create recurring, edit, pause/resume, complete final, renew,
and migrate all work end to end against the real service requester contract.

### B6 — Documentation and operations

**Outcome:** public and private operators understand the new model and upgrade
without decoding source.

Update:

- README product behavior and current limits;
- private configuration examples;
- migration, backup/restore, operations, notification, and verification docs;
- public fixtures and screenshots; and
- release checklist with production migration and next-occurrence verification.

Gate: documentation checks discover every Markdown file; examples parse through
the production loader; no example is unbounded or contains private data.

### B7 — Consolidated release proof

**Outcome:** the full Pulse package is safe to pin and migrate.

Required evidence:

- all Pulse tests and recurrence coverage thresholds pass;
- build, plugin build, Netlify typecheck, docs, privacy lint, formatting, and
  clean Git-consumer installation pass;
- real desktop/narrow/zoom renders are reviewed;
- a private disposable series proves first → follow-up → Done → next → final →
  stop and chain cleanup;
- the production owner classifies each legacy reminder and verifies the exact
  next notification before the old schema is retired;
- backup exists before migration and restore is rehearsed; and
- the exact Git SHA is pushed for Workshop to pin. Workshop itself is not
  modified or released by this program.

## Coverage requirements

Coverage percentages are a floor, not the definition of robustness.

- New schedule and series domain modules: **100% functions**, at least **95%
  lines**, and at least **90% branches**.
- New migration and reconciliation modules: **100% functions**, at least **95%
  lines**, and at least **90% branches**.
- New UI state helpers: **100% functions**, at least **90% lines**, and at least
  **85% branches**.
- The repository-wide coverage result must not regress below the accepted
  pre-feature baseline.
- Every rule in this PRD needs at least one named behavioral assertion; boundary
  and failure rules need explicit negative tests.

Manual Android or provider proof supplements automated tests; it never replaces
deterministic engine, API, persistence, or mounted UI coverage.

## Acceptance criteria

The feature is complete only when all statements are true:

1. New reminders are one-time unless Repeat is explicitly enabled.
2. One-time reminders never generate a second occurrence.
3. Daily, weekly, monthly, and yearly schedules produce correct timezone-aware
   occurrences and human-readable summaries.
4. Every recurring definition has a valid count or inclusive end date and is
   bounded by the product limits.
5. Multi-day weekly and skipped monthly/yearly dates have documented,
   deterministic count behavior.
6. Pulse never has more than one open occurrence per reminder and never emits a
   downtime or overdue backlog storm.
7. Final-series warnings appear in Workshop and every notification in the final
   ntfy chain.
8. Done on the final occurrence stops future generation and retains history.
9. Editing, pausing, resuming, conflicts, and renewal preserve canonical series
   progress and prior history.
10. Deleting a reminder stops open and future work, cleans its notification
    chain durably, and preserves titled completed history.
11. Existing weekly definitions migrate only after explicit classification and
    commit atomically without missed delivery.
12. The recurrence UI is fully keyboard operable, accessible, responsive,
    theme-inheriting, and independently buildable outside Workshop.
13. No Workshop source, private reminder, local path, credential, endpoint,
    topic, or token enters the Pulse package or serialized recurrence state.
14. All phase tests, coverage floors, documentation checks, privacy checks,
    builds, and clean-consumer checks pass.
15. The rendered primary desktop experience has passed the product, visual, and
    production-proof gates after at least one repair loop.

## Release and rollback

- Back up the production runner state before enabling schema v2.
- Deploy code that can read v1 and stage migration without writing partial v2
  data.
- Complete the owner classification in Workshop.
- Verify each canonical schedule summary and next due instant against the
  intended local date/time.
- Confirm one disposable one-time reminder does not recur and one short bounded
  series stops after its final Done.
- Only then retire v1 writes.
- If verification fails before atomic commit, continue using the untouched v1
  state. If a post-commit defect appears, restore the pre-migration backup and
  the prior runner revision together.

## Remaining human discernment

The product direction needs no further abstract design choice. Implementation
has two legitimate owner checkpoints:

1. approve the B4 rendered recurrence and migration experience after it works
   end to end with public fixtures; and
2. classify the real legacy reminders during B7, because code cannot safely
   infer which were intended to run once.

Everything else in this document is an implementation and verification job,
not a reason to stop and ask the owner to design the system mid-build.
