# Release Checklist

Run this checklist before trusting Pulse with real private obligations.

## Code Gates

```sh
npm test
npm run typecheck
npm run build
npm run docs:check
npm run lint
npm run format:check
```

## Data Safety

- Create a backup with `node bin/pulse-state.mjs backup --backup-dir private/backups`.
- Export state with `node bin/pulse-state.mjs export`.
- Import the exported file into a disposable state path.
- Confirm completion history survives restore.
- Confirm migration tests pass before changing state format.

## Security

- Confirm `.env` is not committed.
- Confirm Twilio credentials are set through private environment variables.
- Rotate secrets after any accidental log exposure.
- Keep runner logs private.
- Review [security-and-privacy.md](security-and-privacy.md).

## Privacy Scanner

Run the public boundary scanner:

```sh
npm run lint
```

The privacy scanner must cover public examples, docs, and release docs. Public
fixtures must use fictional obligations and fake phone numbers only.

## Acceptance

The release fixture must prove:

```text
due -> notify -> done -> stop
```

Do not release if a due occurrence can be dismissed, snoozed, skipped, or hidden
without Done.
