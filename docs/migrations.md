# Migrations

## Manual/private-folder to managed Workshop access

Use **Pulse Settings → Move to managed access**:

1. Workshop creates a new ephemeral Ed25519 key and displays only its public
   value.
2. Add that value as `PULSE_SETUP_PUBLIC_KEY` to the existing runner and
   redeploy.
3. Paste the existing production origin into Pulse.
4. Workshop verifies the same origin and new fingerprint, completes pairing,
   stores a per-Mac credential in Keychain, and switches to managed access.

The runner’s reminder definitions, occurrences, completion history, ntfy
subscription/token, and provider account stay in place. The old manual folder
and its credential remain untouched until the managed transaction succeeds.
On failure, continue using the previous connection and retry.

Legacy `PULSE_API_TOKEN` authentication remains accepted during migration.
Legacy `PULSE_NTFY_TOKEN` is recognized as configured so migration does not
force an unnecessary token replacement.

## Unbounded weekly reminders to bounded schedule v2

When a recurrence-capable runner finds legacy weekly definitions, Pulse blocks
ordinary reminder editing and shows **Finish updating your reminder
schedules**. For every legacy reminder, choose **Runs once** or **Repeats** and,
for repeating sets, confirm a finite count. Pulse does not guess intent.

The migration writes no partial classifications. Definitions, adopted open
work, completed title snapshots, and state version 2 commit together under the
runner lock. Failed validation writes nothing. A failed state write triggers a
definition rollback; Pulse reports whether restoration succeeded and gives an
explicit repair warning if the storage provider also rejects that rollback.
Retrying an already-completed migration is safe. Back up the runner first,
then verify every displayed next notification after the commit.

## State-file migrations

The advanced local state file uses:

```json
{
  "version": 2,
  "occurrences": [],
  "events": []
}
```

The importer upgrades the pre-version shape to version 1 for compatibility and
validates version 2 series revisions, ordinals, final flags, title snapshots,
and pending notification-chain cleanup work. It preserves occurrences, events,
due state, and completion history.

Before changing a local state format: stop the runner, back up private state,
export it with `node bin/pulse-state.mjs export`, run the tests, import into a
disposable path, verify history, then restart. Future migrations must preserve
occurrence ids/completion history and reject malformed input before writing.
