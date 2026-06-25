# Pulse

Pulse is a persistent obligation system for recurring duties that should keep
notifying until the human records completion.

Pulse is not a to-do list, project manager, calendar, or ordinary reminder app.
It is a small public engine for private self-hosted runners.

## Current Status

Phase 0 is the project skeleton:

- public repo boundary
- TypeScript package shape
- test and build scripts
- public example config
- private config guardrails
- self-hosting documentation stubs

See [project-plan.md](project-plan.md) for the full phased product plan.

## Public Vs Private Boundary

The public repo contains code, docs, examples, and tests.

Your private runner owns real pulse definitions, notification credentials,
recipient details, and completion history. Do not commit real `pulses.yaml`,
`.env`, state files, backups, or logs.

Start with:

- [docs/quickstart-local-demo.md](docs/quickstart-local-demo.md)
- [docs/private-config.md](docs/private-config.md)
- [docs/security-and-privacy.md](docs/security-and-privacy.md)

## Scripts

```sh
npm test
npm run typecheck
npm run build
npm run docs:check
```
