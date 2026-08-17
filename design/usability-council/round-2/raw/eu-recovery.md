# EU2-R raw council report

Persona: cautious everyday Android/Mac user with low technical confidence;
uses Back, reload, mistakes, cancellation, and recovery heavily.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Narrow route transitions preserve the previous scroll position

- `phone` to `phone-reserve` retained roughly `scrollY: 1407`, placing the new
  heading and instructions far above the viewport.
- The user can land near the completion action without seeing the new task.
- Recovery requires manually realizing the route changed and scrolling up.
- Classification: functional navigation, responsive UX, accessibility.

### P1 — Main Test cooldown can become permanently stale

- `test-not-received` → “Back to Test” exposed inconsistent cooldown state.
- After a send changed the button to `Try again in 10s`, it remained disabled
  past expiry until reload.
- Source schedules countdown refresh only on the recovery route.
- Classification: state/liveness defect and misleading control state.

### P2 — “Check again” does not check the waking runner

- Route: `state/runner-starting`.
- Expected: re-run a health check or update the attempt/status.
- Observed: the action only links to Pairing.
- Recovery requires inferring that the address must be resubmitted.
- Classification: action-semantics mismatch.

### P2 — Critical recovery screens revert to developer language

- Routes include proof, storage, identity, starting, adapter, stale, and
  migration failures.
- Primary safety copy uses terms such as `origin-bound proof`, `pending native
  key`, `durable credential`, `fresh challenge`, `public fingerprint`, `health
  endpoint`, `bounded wait`, `schema v1 → v2`, and `preserved for rollback`.
- Actions remain usable, but a low-confidence user cannot evaluate the safety
  claims.
- Classification: content design and trust hierarchy.

### P2 — Narrow companion panel dominates the first viewport

- At 500×900, the companion spans roughly 150–532px and the task heading begins
  around 666px.
- Repeated progress consumes most of every first viewport.
- Classification: responsive hierarchy and cumulative friction.

### P2 — Duplicate headings create screen-reader ambiguity

- On `phone`, the companion `<h2>` and task `<h1>` are both named “Add your ntfy
  account.”
- Sighted users can distinguish them; heading-navigation users must infer which
  is the actual task.
- Classification: accessibility/semantic hierarchy.

## Strengths

- Complete fictional happy path works.
- Back/reload preserve non-secret progress while pairing codes remain absent
  from storage.
- Invalid inputs focus clear errors that disappear after correction.
- Provider cancellation and destructive restart consequences are truthful.
- Provider acceptance remains distinct from Android receipt.
- Recovery generally preserves progress and offers distinct consequences.
- Desktop presentation is cohesive; narrow controls remain legible and do not
  overflow.
- External actions are clearly simulated and the console remains clean.

No P0 findings. No files were edited.
