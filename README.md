# Pulse

Pulse is a persistent obligation system for recurring duties that should keep
notifying until the human records completion.

Pulse is not a to-do list, project manager, calendar, or ordinary reminder app.
It is a small public engine for private self-hosted runners.

## Current Status

Phases 0-9 are complete:

- public repo boundary
- TypeScript package shape
- test and build scripts
- repeating pulse model and no-dismiss Done state
- runner loop with retry behavior
- Twilio SMS and console notification adapters
- public example configs
- private config guardrails
- self-hosting documentation
- minimal local management UI
- Workshop tool-shell integration
- release hardening with backup, restore, migration, import validation, and
  release checklist gates

See [project-plan.md](project-plan.md) for the full phased product plan.

## Public Vs Private Boundary

The public repo contains code, docs, examples, and tests.

Your private runner owns real pulse definitions, notification credentials,
recipient details, and completion history. Do not commit real `pulses.yaml`,
`.env`, state files, backups, or logs.

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

## Scripts

```sh
npm test
npm run typecheck
npm run build
npm run docs:check
```

Start the local management UI after building:

```sh
PULSE_CONFIG_PATH=./pulses.example.yaml \
PULSE_STATE_PATH=/tmp/pulse-demo-state.json \
node bin/pulse-ui.mjs
```
