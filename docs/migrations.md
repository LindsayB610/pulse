# Migrations

Pulse state files are JSON and must be validated before a runner trusts them.

Current state version:

```json
{
  "version": 1,
  "occurrences": [],
  "events": []
}
```

## Migration Plan

1. Stop the runner.
2. Back up `private/state.json`.
3. Export the existing state with `node bin/pulse-state.mjs export`.
4. Run `npm test` before changing release code.
5. Apply the migration.
6. Import with `node bin/pulse-state.mjs import --input PATH`.
7. Start the runner and verify logs.

## Supported Migration

Phase 9 supports the pre-version private state shape:

```json
{
  "occurrences": [],
  "events": []
}
```

The importer upgrades that shape to `version: 1` and preserves existing
occurrences, events, due state, and completion history.

## Rules For Future Migrations

- Write a failing migration test before changing state format.
- Preserve occurrence IDs.
- Preserve `occurrence_completed` history.
- Reject malformed imports before writing active state.
- Never put private state fixtures in the public repo.
