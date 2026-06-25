# Operations

Pulse operations should stay boring and auditable.

## Check Runner Health

```sh
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs --tail=100 pulse
```

Healthy signs:

- the container is running
- logs show JSON runner results or no recent errors
- `private/state.json` is being updated when pulses are scheduled, due, notified, or completed

## Mark Done

Use the local UI when you have access to the runner host:

```sh
PULSE_CONFIG_PATH=private/pulses.yaml \
PULSE_STATE_PATH=private/state.json \
node bin/pulse-ui.mjs
```

Open <http://127.0.0.1:8787/> and mark the due occurrence Done. The UI writes
the same completion history as the command.

Use the Done command against the private state file:

```sh
PULSE_STATE_PATH=private/state.json \
node bin/pulse-done.mjs --note "Done."
```

In Docker Compose:

```sh
docker compose -f deploy/docker-compose.yml exec pulse \
  node bin/pulse-done.mjs --note "Done."
```

If more than one occurrence is due, pass `--occurrence-id`.

## UI Access

The management UI defaults to `127.0.0.1:8787`. Keep it on localhost for
personal use, or put it behind your own private VPN, SSH tunnel, or authenticated
reverse proxy before exposing it beyond the host.

## Rotate Twilio Secrets

1. Update `PULSE_TWILIO_AUTH_TOKEN` in the private `.env` file or host secret store.
2. Restart the runner.
3. Run the forced test checklist in [verify-runner.md](verify-runner.md).

```sh
docker compose -f deploy/docker-compose.yml restart pulse
```

## Recover From Downtime

Restart the runner. It will mark overdue scheduled occurrences due and resume
the repeat notification policy. If a stale forced test starts notifying, mark it
Done or stop the runner while you inspect state.

## Duplicate Notifications

If duplicate notifications appear inside the configured repeat interval:

1. Check for multiple runner containers.
2. Confirm only one host is writing the same `state.json`.
3. Check `notification_sent` events in `private/state.json`.

## Routine Backups

Back up `private/state.json`, `private/pulses.yaml`, and the private `.env`
through the process in [backup-and-restore.md](backup-and-restore.md).
