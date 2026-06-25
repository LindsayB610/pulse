# Backup And Restore

Pulse state is small but important. It records scheduled occurrences,
notification attempts, and completion history.

## Back Up

Back up these private files:

- `private/pulses.yaml`
- `private/state.json`
- `private/.env`

Create a timestamped backup:

```sh
mkdir -p private/backups
cp private/pulses.yaml private/backups/pulses.$(date -u +%Y%m%dT%H%M%SZ).yaml
cp private/state.json private/backups/state.$(date -u +%Y%m%dT%H%M%SZ).json
cp private/.env private/backups/env.$(date -u +%Y%m%dT%H%M%SZ)
chmod 600 private/backups/*
```

Store backups somewhere private. Do not commit them.

After building, you can also create a validated state backup with Pulse itself:

```sh
npm run build
PULSE_STATE_PATH=private/state.json \
PULSE_CONFIG_PATH=private/pulses.yaml \
node bin/pulse-state.mjs backup --backup-dir private/backups
```

This validates `state.json` before writing `private/backups/state.TIMESTAMP.json`.
If `PULSE_CONFIG_PATH` is set, the command also copies the private config file
into the same backup directory.

## Restore

Stop the runner:

```sh
docker compose -f deploy/docker-compose.yml stop pulse
```

Restore files:

```sh
cp private/backups/pulses.YYYYMMDDTHHMMSSZ.yaml private/pulses.yaml
cp private/backups/state.YYYYMMDDTHHMMSSZ.json private/state.json
cp private/backups/env.YYYYMMDDTHHMMSSZ private/.env
chmod 600 private/pulses.yaml private/state.json private/.env
```

Restart:

```sh
docker compose -f deploy/docker-compose.yml up -d
```

Or restore a validated state backup:

```sh
PULSE_STATE_PATH=private/state.json \
node bin/pulse-state.mjs restore --backup private/backups/state.YYYYMMDDTHHMMSSZ.json
```

The restore command validates the backup before replacing the active state file.

## Export And Import

Export private state before manual changes:

```sh
PULSE_STATE_PATH=private/state.json node bin/pulse-state.mjs export > private/state-export.json
```

Import only after validation passes:

```sh
PULSE_STATE_PATH=private/state.json node bin/pulse-state.mjs import --input private/state-export.json
```

## Verify Restore

1. Check logs for startup errors.
2. Confirm `state.json` includes prior `occurrence_completed` events.
3. Run `npm test` locally if you changed repo files.
4. Run the forced test checklist before trusting a new host.
