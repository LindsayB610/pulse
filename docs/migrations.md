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

## State-file migrations

The advanced local state file uses:

```json
{
  "version": 1,
  "occurrences": [],
  "events": []
}
```

The importer upgrades the pre-version shape to version 1 while preserving
occurrences, events, due state, and completion history.

Before changing a local state format: stop the runner, back up private state,
export it with `node bin/pulse-state.mjs export`, run the tests, import into a
disposable path, verify history, then restart. Future migrations must preserve
occurrence ids/completion history and reject malformed input before writing.
