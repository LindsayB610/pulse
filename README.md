# Pulse

Pulse is a persistent obligation system for recurring duties that should keep
notifying until the human records completion.

Pulse is not a to-do list, project manager, calendar, or ordinary reminder app.
It is a small public engine and Workshop app backed by a private, user-owned
cloud runner.

## Current Status

The durable engine, authenticated Netlify runner API, ntfy delivery, and
independently versioned Workshop plugin are complete for the current
weekly-reminder model:

- public repo boundary
- TypeScript package shape
- test and build scripts
- weekly repeating pulse model with durable occurrence and completion history
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
- optional semantic host-theme inheritance with exact standalone color fallbacks
- release hardening with backup, restore, migration, import validation, and
  release checklist gates

Twilio/SMS is retired. Pulse does not send SMS or email.

See [project-plan.md](project-plan.md) for the full phased product plan.

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
5. The Pulse app inside Workshop creates, edits, pauses, resumes, and deletes
   pulse definitions. Workshop is the desktop host; the management UI and API
   contract belong to Pulse.

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
- **Netlify environment:** ntfy topic/token, runner API token, notification
  action secret, provider settings, and public callback origin
- **Private local Pulse folder:** `pulse.config.json`, containing only the
  service endpoint and a Keychain credential reference
- **macOS Keychain:** the runner API credential used by Workshop's constrained
  native service requester

The runner API token never enters Pulse's webview.

The YAML/state-file runner remains available for local demos and recovery
tooling. It is not a second synchronized production source of truth; the hosted
Netlify runner is authoritative for this release.

## Getting Started

Start with:

- [docs/quickstart-local-demo.md](docs/quickstart-local-demo.md)
- [docs/private-config.md](docs/private-config.md)
- [docs/env-vars.md](docs/env-vars.md)
- [docs/deploy-runner.md](docs/deploy-runner.md)
- [docs/verify-runner.md](docs/verify-runner.md)
- [docs/security-and-privacy.md](docs/security-and-privacy.md)
- [docs/backup-and-restore.md](docs/backup-and-restore.md)
- [docs/migrations.md](docs/migrations.md)
- [docs/release-checklist.md](docs/release-checklist.md)

Requirements:

- Node.js 20 or newer for development and checks
- Chrome or Chromium for the browser-resolved theme contract test; set
  `PULSE_TEST_CHROME` if its executable is outside the standard macOS or Linux
  locations
- a user-owned Netlify site for the production runner
- an authenticated private ntfy topic and the ntfy Android app
- Workshop with the generic secure-service capability for the desktop UI

For a local public-data smoke test:

```sh
npm install
npm test
```

Then follow the local demo, private config, deployment, and verification guides
above. Never substitute public example data for a tested private production
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

## Current Product Limits

The current creator supports one weekly day, a local time, an IANA time zone,
and the Snooze/no-action interval. Weekly recurrence is currently unbounded.

Calendar-style bounded recurrence—one-time, daily, weekly, monthly, and yearly
schedules with an occurrence limit, final-occurrence warning, expiry, and
renewal—is the next separate feature build. Those behaviors are not silently
implied by the current model.
