# Release Checklist

## Automated gates

```sh
npm test
npm run test:coverage
npm run test:theme-render
npm run typecheck
npm run typecheck:netlify
npm run build
npm run build:plugin
npm run docs:check
npm run lint
npm run format:check
```

Also run Workshop’s Rust tests and desktop typecheck when the generic managed
secure-service capability changes. Prove a clean Git consumer can install the
exact Pulse revision and build both packages.

## Setup acceptance

- New user completes the full guided path without terminal, JSON, folder, env,
  API-token, or Keychain work.
- Interrupted pre-pair setup resumes from native state; post-pair setup resumes
  from authenticated runner status.
- Invalid origins, redirects, fingerprints, signatures, expired/reused codes,
  malformed state, and secret-bearing state fail closed.
- No setup private key, client credential, ntfy token, authorization header, or
  capability appears in the webview, public config, URL query, logs, or tests.
- A second Mac receives separate revocable access through a ten-minute one-use
  invitation.
- Migration preserves the existing runner data and old connection on failure.
- Disconnect revokes only the current Mac and clearly says the remote
  deployment and provider billing remain.
- Start over is confirmed, names the deployed resources it leaves behind, and
  cannot strand the user on a pre-pair step after pairing is complete.
- The setup test is isolated and idempotent; it creates no reminder, occurrence,
  history item, Done action, or Snooze action.

## Reminder acceptance

Prove `due -> notify -> done -> stop`, manual snooze, two-minute no-action snooze,
Done overriding an active snooze, and sequence-only ntfy cleanup. A temporary
cleanup failure must not roll back Done and must retry after five minutes.

## Data and ownership

- Create a backup, then export/restore a disposable state copy and verify
  completion history.
- Confirm public fixtures contain only fictional data and `npm run lint` passes.
- Confirm the provider account, deployment, ntfy account, and any bill belong
  to the test user—not the Pulse maintainer.
- Confirm deletion instructions point to the provider dashboard and do not
  imply that disconnecting Workshop stops billing.

## Security and privacy scanner

- Re-run the security boundary tests for pairing, native storage, Keychain,
  origin pinning, one-use sessions, rollback, and revocation.
- Run the privacy scanner through `npm run lint` and inspect any exception
  manually before release.

## Human gates

Before general release, complete the guided flow on a disposable production
deployment with Android delivery, then run two unfamiliar-human walkthroughs:
one moderately technical/non-developer and one lower-confidence user. Record
stalls, wrong turns, recovery failures, and inaccurate copy. This is the final
gate that automation cannot honestly replace.
