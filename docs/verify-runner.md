# Verify Runner

Run this checklist before trusting Pulse with real obligations.

Set `PULSE_PRIVATE_ROOT` to the absolute private directory outside the public
checkout before running the command examples.

## Forced Test

1. Copy [../examples/forced-test-pulse.yaml](../examples/forced-test-pulse.yaml)
   to your private `pulses.yaml`.
2. Change `daysOfWeek` and `time` so the pulse is due a few minutes from now.
3. Set `channels: [console]` for a local smoke or `channels: [ntfy]` for an
   Android push smoke.
4. Start the runner.

## Expected Sequence

1. The runner creates `state.json`.
2. The runner schedules an occurrence.
3. When the occurrence becomes due, the runner sends a notification.
4. If neither notification action is used, wait two minutes and confirm Pulse
   automatically snoozes the occurrence for its configured duration (30 minutes
   by default).
5. Tap the duration-aware **Snooze** button on the Android notification and
   confirm a new notification arrives after that configured duration in the
   same ntfy notification chain.
6. Tap **Done** on that notification.
7. Confirm that occurrence's notification chain disappears from ntfy, no more
   notifications are sent for it, and completion history is present in
   `state.json`.
8. Confirm other Pulse notifications and the saved recurring Pulse definition
   remain intact.

## Done fallback command

Use the Android notification's Done action for normal completion. The legacy
headless command below is retained only as an operator recovery path; it is
not required for normal use.

If exactly one occurrence is due:

```sh
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" \
node bin/pulse-done.mjs --note "Verified runner."
```

If multiple occurrences are due, pass the occurrence id:

```sh
PULSE_STATE_PATH="$PULSE_PRIVATE_ROOT/state.json" \
node bin/pulse-done.mjs \
  --occurrence-id forced-test-check:2026-06-28T16:00:00.000Z \
  --note "Verified runner."
```

Expected result:

```json
{"occurrenceId":"forced-test-check:2026-06-28T16:00:00.000Z","state":"done","completedAt":"2026-06-28T16:05:00.000Z"}
```

The timestamp will be the actual completion time.

## Pass Criteria

- The runner can start from an empty state file.
- The forced test occurrence becomes due.
- The expected notification channel fires.
- Repeats continue while the occurrence is due.
- The Android Done action marks the occurrence Done.
- Done removes only that occurrence's ntfy sequence.
- Notification repeats stop after Done.
- `state.json` contains `completedAt` for the occurrence.

If sequence deletion fails during this test, completion must still remain Done.
Leave the runner active and confirm it retries cleanup after five minutes. Old
notifications created before sequence support are outside this check and require
manual removal in ntfy.
