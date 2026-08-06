# Pulse

Pulse is a persistent obligation system for recurring duties that should keep
notifying until the human records completion.

Pulse is not a to-do list, project manager, calendar, or ordinary reminder app.
It is a small public engine for private self-hosted runners.

## Current Status

The durable engine, ntfy delivery, authenticated runner API, and independently
versioned Workshop plugin are being completed as one rebuild package:

- public repo boundary
- TypeScript package shape
- test and build scripts
- repeating pulse model and no-dismiss Done state
- runner loop with retry behavior
- console notifications for local demos; authenticated ntfy Android push for production
- public example configs
- private config guardrails
- self-hosting documentation
- Pulse-owned plugin UI and generic secure-service host-capability proposal
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

Pulse owns its management UI and can run inside Workshop as an independently
versioned app. Workshop is only the desktop host. The plugin uses Workshop's
generic secure-service capability documented in
[docs/workshop-secure-service-capability.md](docs/workshop-secure-service-capability.md).
