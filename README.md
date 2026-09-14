# Pulse

Pulse is a persistent obligation system for recurring duties that should keep
notifying until the human records completion.

Pulse is not a to-do list, project manager, calendar, or ordinary reminder app.
It is a small public engine and Workshop app backed by a private, user-owned
cloud runner.

## Current Status

The durable engine, authenticated Netlify runner API, ntfy delivery, and
independently versioned Workshop plugin support one-time and finite recurring
reminders:

- public repo boundary
- TypeScript package shape
- test and build scripts
- one-time, daily, weekly, monthly, and yearly schedules with durable
  occurrence and completion history
- recurrence off by default, with required count/date endings, a 365-occurrence
  cap, and a five-year horizon
- Pulse-owned, keyboard-accessible desktop date selection for start and end dates
- canonical series revisions, remaining/final warnings, a Finished section,
  and explicit renewal instead of silent infinity
- one active occurrence per pulse and no dismiss/skip escape hatch
- automatic no-action snooze after two minutes
- configurable snooze duration, defaulting to 30 minutes
- Done and Snooze actions inside Android notifications
- Done overriding an active snooze and clearing that occurrence's ntfy chain
- fixed five-minute retries for failed delivery and notification-chain cleanup
- console notifications for local demos and authenticated ntfy Android push for production
- Netlify scheduled functions with private Netlify Blobs definitions and state
- public example configs
- private config guardrails
- Pulse-owned plugin UI using Workshop's generic secure-service capability
- guided first-run setup with native pending-state restoration, origin-bound
  runner pairing, per-Mac credentials, a runner-owned ntfy-token handoff, and
  an isolated delivery test
- optional semantic host-theme inheritance with exact standalone color fallbacks
- release hardening with backup, restore, migration, import validation, and
  release checklist gates

Twilio/SMS is retired. Pulse does not send SMS or email.

See [project-plan.md](project-plan.md) for the full phased product plan.

The guided user-owned setup is documented in
[docs/guided-setup.md](docs/guided-setup.md). ntfy and Netlify are the first
supported adapters, not permanent core dependencies. The previous manual
private-folder setup remains available under Advanced setup. The selected
prototype, rendered evidence, and
[fresh nine-reviewer usability retest](design/usability-council/round-2/synthesis.md)
are public. A disposable production run and two unfamiliar-human production
walkthroughs remain the final release gates.

## How It Works

1. Pulse's scheduled Netlify function runs every minute, creates or advances
   occurrences, and sends due notifications through ntfy.
2. The Android notification offers **Done** and a duration-aware **Snooze**.
3. If neither action is used within two minutes, Pulse treats no action as a
   snooze and schedules the next notification after that pulse's configured
   interval.
4. Done wins even while a manual or automatic snooze is active. It records
   completion, stops later notifications for that occurrence, and deletes only
   that occurrence's ntfy notification chain. If deletion fails, completion
   remains durable and cleanup retries after five minutes.
5. The Pulse app inside Workshop creates one-time reminders by default. Turning
   on **Repeat this reminder** reveals finite daily, weekly, monthly, or yearly
   recurrence, a readable summary, and the next three dates.
6. The app also edits, pauses, resumes, renews, and deletes definitions.
   Workshop is the desktop host; the management UI and API contract belong to
   Pulse.

The laptop and Workshop do not need to be running for notifications or phone
actions to work.

## Public vs. Private Boundary

The public repo contains code, docs, examples, and tests.

The private runner owns real pulse definitions, credentials, and completion
history. Do not commit real `pulses.yaml`, `.env` files, `pulse.config.json`,
state files, backups, logs, topics, or tokens.

Production data is split deliberately:

- **Netlify Blobs:** real pulse definitions, occurrence state, event history,
  and runner heartbeat
- **Netlify environment:** public setup key, private topic name, notification
  server origin, and provider mode; Netlify supplies the canonical production
  site URL
- **Private Netlify Blobs:** the ntfy token, generated notification-action
  signing material, hashed client credentials, hashed setup capabilities, real
  definitions, occurrence state, history, and heartbeat
- **Workshop native application data:** an ephemeral pending setup record and,
  after pairing, a metadata-only `pulse.config.json`
- **macOS Keychain:** a separate runner credential for this Workshop
  installation

The runner API token never enters Pulse's webview.

The YAML/state-file runner remains available for local demos and recovery
tooling. It is not a second synchronized production source of truth; the hosted
Netlify runner is authoritative for this release.

## Getting Started

For normal setup, start with:

- [docs/guided-setup.md](docs/guided-setup.md)

Advanced, development, and operations references:

- [docs/quickstart-local-demo.md](docs/quickstart-local-demo.md)
- [docs/private-config.md](docs/private-config.md)
- [docs/env-vars.md](docs/env-vars.md)
- [docs/deploy-runner.md](docs/deploy-runner.md)
- [docs/runner-setup-protocol.md](docs/runner-setup-protocol.md)
- [docs/deployment-adapters.md](docs/deployment-adapters.md)
- [docs/verify-runner.md](docs/verify-runner.md)
- [docs/security-and-privacy.md](docs/security-and-privacy.md)
- [docs/backup-and-restore.md](docs/backup-and-restore.md)
- [docs/migrations.md](docs/migrations.md)
- [docs/release-checklist.md](docs/release-checklist.md)

Requirements:

- Node.js 20 or newer for development and checks
- Playwright's managed Chromium Headless Shell for browser checks. Install it
  once with `npx playwright install chromium`. Normal tests never launch the
  Mac's installed GUI Chrome; `PULSE_TEST_CHROME` is an explicit override only.
- a user-owned compatible runner; Netlify is the first guided adapter
- an authenticated private ntfy topic and the ntfy Android app
- Workshop with the generic secure-service capability for the desktop UI

For a local public-data smoke test:

```sh
npm install
npm test
```

Normal users follow the setup inside Workshop. The raw configuration and
deployment guides are for local development, self-hosting, migration, and
recovery. Never substitute public example data for a private production
configuration.

## Scripts

```sh
npm test
npm run test:coverage
npm run test:theme-render
npm run lint
npm run format:check
npm run typecheck
npm run typecheck:netlify
npm run build
npm run build:plugin
npm run docs:check
```

Pulse owns its management UI and runs inside Workshop as an independently
versioned app. Workshop is only the desktop host. The plugin uses Workshop's
generic secure-service capability documented in
[docs/workshop-secure-service-capability.md](docs/workshop-secure-service-capability.md).

## Recurrence and current limits

New reminders run once unless **Repeat this reminder** is checked. Recurring
sets support daily, weekly (including multiple weekdays), monthly exact-date,
monthly weekday-position/last-day, and yearly cadence. Every set ends after a
chosen number of reminders or on an inclusive local date. There is no `Never`.

Each set is limited to 365 actual occurrences and five local calendar years.
Only one occurrence can be open; missed cadence never queues a backlog. A
completed one-time reminder or exhausted set moves to **Finished**, where it
can be scheduled again explicitly. Existing unbounded weekly data is blocked
behind an all-or-nothing classification screen before schedule v2 activates.
The full contract and edge-case behavior live in
[docs/bounded-recurrence-prd.md](docs/bounded-recurrence-prd.md).
