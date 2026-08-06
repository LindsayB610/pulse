# Backup And Restore

Pulse state is small but important. It records scheduled occurrences,
notification attempts, and completion history.

Set `PULSE_PRIVATE_ROOT` to your host's absolute private directory outside the
public checkout before using these commands. For example:

```sh
export PULSE_PRIVATE_ROOT=/srv/pulse-private
```

## Back Up

Back up these private files:

- `$PULSE_PRIVATE_ROOT/pulses.yaml`
- `$PULSE_PRIVATE_ROOT/state.json`
- `$PULSE_PRIVATE_ROOT/.env`

Create a timestamped backup:

```sh
mkdir -p "$PULSE_PRIVATE_ROOT/backups"
cp "$PULSE_PRIVATE_ROOT/pulses.yaml" "$PULSE_PRIVATE_ROOT/backups/pulses.$(date -u +%Y%m%dT%H%M%SZ).yaml"
cp "$PULSE_PRIVATE_ROOT/state.json" "$PULSE_PRIVATE_ROOT/backups/state.$(date -u +%Y%m%dT%H%M%SZ).json"
cp "$PULSE_PRIVATE_ROOT/.env" "$PULSE_PRIVATE_ROOT/backups/env.$(date -u +%Y%m%dT%H%M%SZ)"
chmod 600 "$PULSE_PRIVATE_ROOT/backups"/*
```

Store backups somewhere private. Do not commit them.

After building, you can also create a validated state backup with Pulse itself:

```sh
npm run build
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" \
PULSE_CONFIG_PATH="$PULSE_PRIVATE_ROOT/pulses.yaml" \
node bin/pulse-state.mjs backup --backup-dir "$PULSE_PRIVATE_ROOT/backups"
```

This validates `state.json` before writing `$PULSE_PRIVATE_ROOT/backups/state.TIMESTAMP.json`.
If `PULSE_CONFIG_PATH` is set, the command also copies the private config file
into the same backup directory.

## Restore

Stop the runner:

```sh
node bin/pulse-compose.mjs stop pulse
```

Restore files:

```sh
cp "$PULSE_PRIVATE_ROOT/backups/pulses.YYYYMMDDTHHMMSSZ.yaml" "$PULSE_PRIVATE_ROOT/pulses.yaml"
cp "$PULSE_PRIVATE_ROOT/backups/state.YYYYMMDDTHHMMSSZ.json" "$PULSE_PRIVATE_ROOT/state.json"
cp "$PULSE_PRIVATE_ROOT/backups/env.YYYYMMDDTHHMMSSZ" "$PULSE_PRIVATE_ROOT/.env"
chmod 600 "$PULSE_PRIVATE_ROOT/pulses.yaml" "$PULSE_PRIVATE_ROOT/state.json" "$PULSE_PRIVATE_ROOT/.env"
```

Restart:

```sh
node bin/pulse-compose.mjs up -d
```

Or restore a validated state backup:

```sh
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" \
node bin/pulse-state.mjs restore --backup "$PULSE_PRIVATE_ROOT/backups/state.YYYYMMDDTHHMMSSZ.json"
```

The restore command validates the backup before replacing the active state file.

## Export And Import

Export private state before manual changes:

```sh
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" node bin/pulse-state.mjs export > "$PULSE_PRIVATE_ROOT/state-export.json"
```

Import only after validation passes:

```sh
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" node bin/pulse-state.mjs import --input "$PULSE_PRIVATE_ROOT/state-export.json"
```

## Verify Restore

1. Check logs for startup errors.
2. Confirm `state.json` includes prior `occurrence_completed` events.
3. Run `npm test` locally if you changed repo files.
4. Run the forced test checklist before trusting a new host.
