# Operations

Pulse operations should stay boring and auditable.

In these commands, `PULSE_PRIVATE_ROOT` is the absolute private directory
outside the public checkout (for example, `/srv/pulse-private`).

## Check Runner Health

```sh
node bin/pulse-compose.mjs ps
node bin/pulse-compose.mjs logs --tail=100 pulse
```

Healthy signs:

- the container is running
- logs show JSON runner results or no recent errors
- `$PULSE_PRIVATE_ROOT/state.json` is being updated when pulses are scheduled, due, notified, or completed

## Done and Snooze

Tap **Done** in the Android notification when the reminder is complete. This
stops repeat notifications for that occurrence without opening Workshop. Tap
**Snooze 30 min** to move that same reminder forward thirty minutes; it will
notify again until you tap Done.

If neither action is taken, Pulse treats the reminder as snoozed after two
minutes and schedules the next notification for thirty minutes later. The
notification is not silently dismissed; only Done ends the occurrence.

Workshop's Pulse tool is for creating, pausing, resuming, and deleting
reminders. The runner remains the source of truth; Workshop does not need to
be available to acknowledge a phone reminder.

The Done command remains an operator recovery path against a private state
file:

```sh
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" \
node bin/pulse-done.mjs --note "Done."
```

In Docker Compose:

```sh
node bin/pulse-compose.mjs exec pulse \
  node bin/pulse-done.mjs --note "Done."
```

If more than one occurrence is due, pass `--occurrence-id`.

## Rotate ntfy Secrets

1. Update `PULSE_NTFY_TOKEN` in the private `.env` file or host secret store.
2. Restart the runner.
3. Run the forced test checklist in [verify-runner.md](verify-runner.md).

```sh
node bin/pulse-compose.mjs restart pulse
```

## Recover From Downtime

Restart the runner. It will mark overdue scheduled occurrences due and resume
the repeat notification policy. If a stale forced test starts notifying, mark it
Done or stop the runner while you inspect state.

## Duplicate Notifications

If duplicate notifications appear inside the configured repeat interval:

1. Check for multiple runner containers.
2. Confirm only one host is writing the same `state.json`.
3. Check `notification_sent` events in `$PULSE_PRIVATE_ROOT/state.json`.

## Routine Backups

Back up `$PULSE_PRIVATE_ROOT/state.json`, `$PULSE_PRIVATE_ROOT/pulses.yaml`, and the private `.env`
through the process in [backup-and-restore.md](backup-and-restore.md).
