# Pulse Project Plan

## Name

Pulse.

Working product frame:

> A persistent obligation system for recurring duties that should keep notifying until the human records completion.

Pulse is not a to-do list, project manager, calendar, or ordinary reminder app.

The product promise is:

> The system remembers what the human should not have to, and it does not stop asking until the obligation is done.

## Phase Index At A Glance

| Phase | Status | Name | Outcome |
| --- | --- | --- | --- |
| 0 | Complete | Project shape | Public repo, README, license, package skeleton, test runner, and product docs exist. |
| 1 | Complete | Core pulse model | Repeating pulse definitions generate due occurrences with durable state and completion history. |
| 2 | Complete | No-dismiss state machine | A due occurrence can only leave the active notification loop by being marked Done. |
| 3 | Complete | Local private data contract | Real pulses, secrets, delivery settings, and history live in private local config outside the public repo. |
| 4 | Complete | Runner loop | A headless runner detects due occurrences, sends notifications, retries, and prevents duplicate sends. |
| 5 | Not started | Notification adapters | Email and one phone-friendly channel are implemented behind a stable adapter interface. |
| 6 | Not started | Self-hosting docs | Users can deploy their own private cloud runner with copyable setup, env, verification, and operations docs. |
| 7 | Not started | Minimal management UI | A tiny local/web UI can list pulses, show due state, mark Done, and inspect completion history. |
| 8 | Not started | Workshop integration | Pulse can optionally appear as a Workshop tool while keeping the public Pulse repo as source of truth. |
| 9 | Not started | Release hardening | Backup, restore, migrations, security review, and end-to-end acceptance gates are documented and tested. |

## TDD Methodology

Pulse should be built test-first wherever the behavior can be expressed as a deterministic contract.

Each implementation phase should follow this loop:

1. Write the smallest failing test or executable contract for the phase outcome.
2. Implement the minimum code or docs needed to make that test pass.
3. Refactor only after the test is green.
4. Add regression tests for discovered edge cases before fixing them.
5. Do not mark the phase complete until the phase acceptance scenario passes from a clean checkout.

Use this hierarchy for tests:

- Core state and schedule rules: unit tests first.
- Config and persistence: contract tests with fixture files.
- Runner behavior: fake-clock integration tests.
- Notification delivery: adapter tests with mocked transports plus one documented manual/live verification path.
- Self-hosting docs: command/checklist tests where automation is practical, and explicit human verification where provider setup cannot be automated.
- UI and Workshop integration: component tests first, then Playwright route/workflow tests.

Every phase below lists the tests to write before implementation. If a phase requires documentation rather than runtime code, write the example config, command transcript, or verification checklist first and treat it as the failing contract until the docs are complete enough to satisfy it.

## Product Goal

Build a public, reusable Pulse engine and runner that anyone can self-host privately.

The first real use case is a weekly recurring personal obligation:

- "Remind me every Sunday morning to complete a recurring personal check."
- "Keep notifying me until I mark that occurrence Done."
- "Let me look back and know whether I actually completed it."

That use case is the product north star. Pulse exists because normal reminders can be seen, dismissed, forgotten, or lost when the device that owns them is offline.

## Ultimate Goal

Pulse should become the smallest possible trustworthy system for durable recurring obligations.

The mature version should let a user:

- define repeating pulses in a private config file or small UI
- run the Pulse engine locally for development
- deploy a private always-on runner to their own cloud account
- receive notifications even when their laptop is closed or off
- mark individual occurrences Done
- keep a durable completion record
- review what happened and when
- rotate secrets and back up state without exposing real obligations publicly

Pulse should stay calm and opinionated. If an obligation is due, the system should not offer snooze, dismiss, skip, or "remind me later" as primary escape hatches.

## Product Non-Goals

Do not build these into the MVP:

- snooze
- dismiss
- skip
- task projects
- labels
- priority systems
- team workflows
- AI
- accounts
- hosted multi-tenant cloud
- analytics dashboards
- calendar replacement
- generic productivity-suite behavior

Recurring schedules are not a future add-on. They are core to Pulse.

## Public Repo Boundary

Pulse should be its own public GitHub repository.

Expected local project path:

```text
/Users/lindsaybrunner/Documents/marketing-builds/pulse
```

Expected GitHub shape:

```text
https://github.com/LindsayB610/pulse
```

The public repo may contain:

- application code
- schedule engine
- occurrence state machine
- runner code
- notification adapter interfaces
- example notification adapters
- `pulses.example.yaml`
- `.env.example`
- demo pulses
- tests
- deployment guides
- security notes
- backup and restore docs

The public repo must not contain:

- real user pulse definitions
- health details, family logistics, or other private obligations
- production notification credentials
- production recipient addresses or phone numbers
- completion history from a real deployment
- private runner secrets

## Private Runner Boundary

Each user owns their private runner deployment.

The public repo gives them the Pulse engine. Their private setup owns:

- real `pulses.yaml`
- real state database or state file
- notification credentials
- notification recipients
- deployment provider account
- domain or callback URL if needed
- backup location
- secret keys

The docs should make this boundary impossible to miss.

Key sentence:

> The public repo gives you the Pulse engine. Your private runner deployment owns your real obligations, credentials, and completion history.

## Core Concepts

### Pulse Definition

A pulse definition describes the repeating obligation.

```ts
type PulseDefinition = {
  id: string;
  title: string;
  schedule: PulseSchedule;
  active: boolean;
  instructions?: string;
  notificationPolicy?: NotificationPolicy;
};
```

Example:

```yaml
pulses:
  - id: weekly-personal-check
    title: Weekly personal check
    active: true
    schedule:
      type: weekly
      daysOfWeek: [sunday]
      time: "09:00"
      timezone: America/Los_Angeles
    notificationPolicy:
      channels: [email]
      repeatEveryMinutes: 30
```

### Pulse Occurrence

An occurrence is one due instance of a pulse.

```ts
type PulseOccurrence = {
  id: string;
  pulseId: string;
  dueAt: string;
  state: "scheduled" | "due" | "done";
  completedAt?: string;
  completionNote?: string;
};
```

### Pulse Event

An event is the durable audit trail.

```ts
type PulseEvent = {
  id: string;
  pulseId: string;
  occurrenceId?: string;
  type:
    | "pulse_created"
    | "occurrence_scheduled"
    | "occurrence_became_due"
    | "notification_sent"
    | "occurrence_completed";
  at: string;
  metadata?: Record<string, unknown>;
};
```

The event log is what lets Pulse answer: "What happened, when?"

## State Machine

Pulse should keep the state machine intentionally small.

```text
scheduled
  -> due
  -> done
```

Rules:

- A scheduled occurrence becomes due when `dueAt <= now`.
- A due occurrence remains due until it is marked Done.
- Notifications may repeat while an occurrence is due.
- Notifications stop only when the occurrence is marked Done.
- Marking Done records `completedAt`.
- Completing one occurrence does not complete the next repeating occurrence.
- The next occurrence should be scheduled according to the pulse definition.

No MVP state should mean "seen but not done."

## Notification Philosophy

Pulse notifications are delivery mechanisms, not the product.

The product is durable obligation state.

Notification rules:

- send when an occurrence becomes due
- continue sending according to the notification policy while due
- record notification attempts
- avoid duplicate sends for the same channel and interval
- stop only when Done is recorded
- recover cleanly if the runner was offline

If the runner was offline, it should detect overdue occurrences on restart and resume pressure.

## Always-On Runner Requirement

A local desktop app cannot guarantee notifications while a laptop is asleep or off.

Pulse therefore needs a runner that can be deployed somewhere always-on.

The runner should:

- load private pulse definitions
- load private state
- generate missing occurrences
- mark due occurrences
- send notifications
- record attempts
- expose a way to mark occurrences Done
- persist completion history
- provide logs that explain what happened

The runner should be usable in two modes:

- local development mode
- private cloud deployment mode

## Self-Hosting Documentation Contract

The docs are a first-class product surface.

Minimum docs:

- `docs/quickstart-local-demo.md`
- `docs/private-config.md`
- `docs/deploy-runner.md`
- `docs/notification-adapters.md`
- `docs/verify-runner.md`
- `docs/operations.md`
- `docs/security-and-privacy.md`
- `docs/backup-and-restore.md`

The docs should walk a user through:

1. cloning the public repo
2. running demo pulses locally
3. copying `pulses.example.yaml` to private `pulses.yaml`
4. configuring notification credentials in private env vars
5. running a forced test pulse
6. deploying the runner to a cloud host
7. verifying a real notification was sent
8. marking the occurrence Done
9. confirming notifications stop
10. confirming completion history was recorded

The docs should include explicit warnings:

- do not commit real `pulses.yaml`
- do not commit `.env`
- do not commit state files containing real completion history
- do not put sensitive obligation names in public demo data

## Suggested Deployment Targets

Start with one recommended deployment path, then add alternates only when tested.

Recommended v1 path:

- Dockerized Node runner on a small always-on host

Candidate guide targets:

- Fly.io
- Render
- Railway
- small VPS with Docker Compose

Do not promise a provider until the guide has been verified end to end.

## Notification Adapter Strategy

Use an adapter interface so notification channels do not leak into the core state machine.

```ts
type NotificationAdapter = {
  id: string;
  send(input: NotificationInput): Promise<NotificationResult>;
};
```

MVP adapters:

- console adapter for tests and local demo
- email adapter for practical self-hosting

Strong candidate next adapter:

- SMS via Twilio

Phone-friendly delivery matters, but the first adapter should be selected based on setup clarity and reliable docs.

## Minimal UI

Pulse can start with a tiny management surface.

Minimum UI:

- active due occurrences
- scheduled upcoming occurrences
- recent completion history
- Done action
- optional completion note
- runner health
- last notification attempt

The UI should not become a planning board. It exists to answer:

- what is due?
- what is coming?
- did I do it?
- when did the system last notify?
- is the runner alive?

## Relationship To Workshop

Pulse may later appear as a Workshop tool, but the Pulse repo should remain the product source of truth.

Workshop integration should be treated as a host-shell integration phase, not the core product boundary.

Potential Workshop registry entry:

```ts
{
  id: "pulse",
  displayName: "Pulse",
  description: "Track persistent recurring obligations that keep notifying until done.",
  routes: [
    { id: "active", label: "Active", path: "/pulse/active" },
    { id: "schedule", label: "Schedule", path: "/pulse/schedule" },
    { id: "history", label: "History", path: "/pulse/history" },
    { id: "runner", label: "Runner", path: "/pulse/runner" }
  ],
  requiredLocalCapabilities: [
    "local-workspace",
    "connector-status",
    "run-history"
  ]
}
```

Workshop should not own the private runner. At most, it can:

- edit local private config
- show runner health
- show due and completed occurrences
- open docs
- start local development mode

## Phase 0: Project Shape

Goal:

Create the public repo skeleton and make the product boundary explicit.

TDD entry gate:

- Write a repo-shape smoke test or checklist that fails until required files exist.
- Write config fixture validation for `.env.example` and `pulses.example.yaml`.
- Add a docs-link check if the repo tooling supports it.

Deliverables:

- README
- license
- package manager setup
- TypeScript config
- test runner
- lint/format config
- `docs/`
- `examples/`
- `.env.example`
- `pulses.example.yaml`
- `.gitignore` that excludes private config and state

Green gate:

- `npm test`
- `npm run typecheck`
- `npm run build`
- docs links check if available

Acceptance:

- A stranger can clone the repo and understand what stays public vs private.

## Phase 1: Core Pulse Model

Goal:

Implement pulse definitions, schedules, occurrences, and events.

TDD entry gate:

- Write failing unit tests for weekly schedule parsing and next-occurrence generation.
- Write fixture tests for example pulse definitions.
- Write event-log contract tests before adding the event writer.

Deliverables:

- schema definitions
- schedule parser
- weekly schedule support
- occurrence generation
- event log primitives
- fixture examples

Required tests:

- weekly Sunday 9am schedule generates the expected occurrence
- timezone is preserved
- inactive pulses do not generate occurrences
- generated occurrences are stable and not duplicated

Acceptance:

- A weekly pulse can produce the next due occurrence deterministically.

## Phase 2: No-Dismiss State Machine

Goal:

Protect the product rule that only Done stops an active occurrence.

TDD entry gate:

- Write failing transition tests before adding transition functions.
- Write explicit negative tests for snooze, dismiss, skip, and seen-style states.
- Write completion timestamp tests before implementing Done.

Deliverables:

- occurrence transition functions
- due detection
- Done action
- completion timestamp recording
- invalid transition errors

Required tests:

- scheduled can become due
- due can become done
- done cannot become due again
- due cannot become snoozed
- due cannot be dismissed
- Done records `completedAt`

Acceptance:

- There is no state or action equivalent to snooze, dismiss, or seen.

## Phase 3: Local Private Data Contract

Goal:

Separate public examples from real private pulse configuration and history.

TDD entry gate:

- Write failing fixture tests for public example config and private config loading.
- Write persistence round-trip tests before choosing final storage details.
- Write gitignore/privacy scanner tests before adding real state paths.

Deliverables:

- private config loader
- state store interface
- local JSON or SQLite implementation
- example config
- private config docs
- gitignore coverage

Required tests:

- example config parses
- real config path can be supplied outside the repo
- secrets are read from env, not config committed to repo
- state write/read round trips
- completion history persists

Acceptance:

- A user can keep real obligations and completion history outside the public repo.

## Phase 4: Runner Loop

Goal:

Build the headless process that keeps Pulse alive.

TDD entry gate:

- Write fake-clock runner tests before implementing the polling loop.
- Write notification-attempt dedupe tests before adding send logic.
- Write offline recovery tests before adding restart behavior.

Deliverables:

- runner command
- polling loop
- due occurrence detection
- notification dispatch
- notification attempt logging
- duplicate send prevention
- offline recovery behavior

Required tests:

- runner sends when occurrence becomes due
- runner repeats according to policy while still due
- runner stops after Done
- runner does not double-send inside the same interval
- runner catches overdue occurrences after downtime

Acceptance:

- A due pulse keeps notifying until completion is recorded.

## Phase 5: Notification Adapters

Goal:

Send real notifications through documented adapters without coupling them to core state.

TDD entry gate:

- Write adapter interface tests with a fake adapter first.
- Write mocked email transport tests before implementing the email adapter.
- Write failure logging and retry tests before wiring adapters into the runner.

Deliverables:

- notification adapter interface
- console adapter
- email adapter
- adapter result logging
- adapter setup docs

Required tests:

- console adapter records expected payload
- email adapter can be tested with safe mocked transport
- adapter failures are recorded and retried according to policy
- notification payload avoids leaking secrets in logs

Acceptance:

- A self-hosted runner can send at least one practical notification channel.

## Phase 6: Self-Hosting Docs

Goal:

Make private runner setup clear enough for another person to operate themselves.

TDD entry gate:

- Write the verification checklist before writing the guide body.
- Add parse tests for every sample config used in docs.
- Add command smoke tests for local-demo docs where practical.

Deliverables:

- local demo quickstart
- private config guide
- deployment guide for one verified host
- env var guide
- forced test pulse walkthrough
- runner verification checklist
- operations guide
- security and privacy guide
- backup and restore guide

Required tests:

- docs commands are exercised in CI where possible
- sample config remains parseable
- deployment guide has an explicit success checklist

Acceptance:

- A user can deploy their own private runner without needing private instructions from the project author.

## Phase 7: Minimal Management UI

Goal:

Give users a small interface for due state, completion, and history.

TDD entry gate:

- Write component tests for due, upcoming, and history states before creating the UI.
- Write a failing Done-action test that proves completion persists and active notifications stop.
- Write a negative UI test proving no snooze or dismiss controls render.

Deliverables:

- active occurrence view
- upcoming occurrence view
- recent history view
- Done action
- optional completion note
- runner health display

Required tests:

- due occurrence appears
- Done action records completion
- completed occurrence moves to history
- notification state shows last attempt
- UI does not expose snooze or dismiss actions

Acceptance:

- The core loop is operable without editing state by hand.

## Phase 8: Workshop Integration

Goal:

Expose Pulse inside Workshop without making Workshop the source of truth.

TDD entry gate:

- Write registry tests before adding the Pulse tool definition.
- Write route-switching tests before adding the Pulse view.
- Write data-root isolation tests before wiring local config access.

Deliverables:

- Workshop tool registry entry
- Pulse tool view
- docs link
- local runner status panel
- local config path selector if appropriate

Required tests:

- Pulse appears in Workshop launcher
- Pulse routes switch correctly
- Pulse docs link opens packaged docs
- Pulse tool does not read other Workshop tool data roots

Acceptance:

- Workshop can host Pulse as a tool, while Pulse remains a separate public repo and self-hosted runner product.

## Phase 9: Release Hardening

Goal:

Make Pulse safe to operate with real obligations.

TDD entry gate:

- Write migration and restore tests before changing state formats.
- Write bad-config failure tests before adding user-facing setup guidance.
- Write the final end-to-end acceptance test before release cleanup.

Deliverables:

- migration plan
- backup and restore flow
- state export
- state import validation
- security review checklist
- privacy scanner rules
- release checklist

Required tests:

- backup restores state and history
- migrations preserve existing occurrences
- bad config fails loudly
- missing credentials fail with setup guidance
- release fixture proves due -> notify -> done -> stop

Acceptance:

- Pulse is ready for a real private deployment with confidence that data and obligations will not silently disappear.

## MVP Acceptance Scenario

The MVP exists when this scenario passes end to end:

1. A user clones the public repo.
2. The user copies `pulses.example.yaml` to a private config path.
3. The user creates a weekly Sunday morning pulse.
4. The user configures a notification adapter privately.
5. The runner is deployed to an always-on host.
6. The runner creates the next Sunday occurrence.
7. When the occurrence becomes due, the runner sends a notification.
8. The runner continues notifying while the occurrence remains due.
9. The user marks the occurrence Done.
10. Pulse records the completion timestamp.
11. Notifications stop for that occurrence.
12. The next weekly occurrence remains scheduled.
13. Completion history can answer whether the obligation was done.

## Open Product Questions

- Should completion require only a Done tap, or should sensitive pulses optionally require a note?
- Should the first real notification adapter be email, SMS, Pushover, or another phone-friendly channel?
- Should the runner expose a tiny authenticated web UI, a CLI-only Done command, or both?
- Should private state use JSON first for simplicity or SQLite first for durability?
- Should missed offline windows send one catch-up notification or resume the full repeat cadence immediately?
- What is the minimum authentication story for marking Done from a notification link?

## Guiding Constraint

Pulse should remain small enough to trust.

If a feature makes it easier to avoid answering "did you do the thing?", it probably does not belong in the first version.
