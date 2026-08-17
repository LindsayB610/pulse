# EU2-M raw council report

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

Persona: everyday Android/Mac user with low technical confidence; methodical,
reads all instructions before acting.

Coverage: completed the fictional happy path; exercised phone-account and
subscription recovery; invalid runner addresses; reload/resume; missing-
notification recovery and resend; existing-runner connection with wrong and
valid pairing codes; advanced runner path; provider-handoff cancellation;
identity mismatch; completion; restart modal; and a 500px narrow viewport. No
files, credentials, provider accounts, or deployments were touched.

## Findings

### P1 — Route changes preserve the old scroll position

- Route: `#/selected/phone` to `#/selected/phone-reserve`.
- Task: finish one step and begin the next at its heading.
- Expected: the new screen opens at the top.
- Observed: after reading the long page and activating “My ntfy user is saved,”
  the next screen landed at `scrollY: 1407`; its heading was 741px above the
  viewport.
- Recovery: manually recognize the stale scroll position and scroll upward.
- Classification: functional navigation/design defect.
- Evidence: measured at 500×900 after the real link click; the hash was
  `#/selected/phone-reserve`, heading “Make the Pulse topic private,” heading
  top `-741.39`, and `scrollY: 1407`.
- Source confirmation: `render()` focuses the root with `preventScroll` and
  performs no route-level scroll reset.

### P1 — Resend cooldown can become permanently stale on Test

- Route: `#/selected/state/test-not-received` → “Back to Test” →
  `#/selected/test`.
- Expected: “Try again in Ns” counts down and re-enables.
- Observed: the button remained disabled at “Try again in 8s” after 11.5 more
  seconds. It worked only after an undocumented reload.
- Recovery: possible through reload, but the interface gives no cue.
- Classification: functional state/timer defect.
- Source confirmation: the refresh timer is installed only for the
  `test-not-received` recovery state, not the regular Test screen.

### P1 — Resume says Ready while linking to unfinished connection

- Route: complete setup → submit `#/selected/existing` → welcome.
- Expected: “Continue at Ready” opens `#/selected/complete`.
- Observed: the CTA said “Continue at Ready” and showed 7 of 7, but linked to
  `#/selected/existing` and opened “Connect this Mac to your runner.”
- Recovery: possible only by noticing the inconsistency and using the progress
  rail.
- Classification: functional state-integrity/trust defect.
- Source confirmation: existing-runner submission overwrites `lastRoute` with
  `existing` while retaining a higher `furthestIndex`; the label and href are
  derived from those conflicting values.

### P2 — Missing-notification recovery names checks it cannot reach

- Route: `#/selected/state/test-not-received`.
- Copy names exact topic, Android permission, subscription mute state, and
  Instant delivery.
- Only repair action, “Check my phone setup,” returns to subscription setup,
  which does not cover Android notification permission or mute repair.
- Recovery requires outside Android/ntfy knowledge.
- Classification: recovery-content/action mismatch.

### P3 — Narrow layout repeats progress before the actual task

- At 500×900, global progress, the full seven-step companion list, the phone
  eyebrow, and the inner four-step progress all precede the working instruction.
- On `phone-reserve`, the heading begins roughly 666px down.
- Classification: responsive information-density issue.

## Strengths

- Honest account ownership, billing, secret, and delivery-receipt boundaries.
- Specific Back controls and concrete phone completion criteria.
- Invalid runner values and wrong pairing codes receive useful inline errors.
- Provider cancellation and identity mismatch state exactly what stayed safe.
- Human receipt confirmation prevents a false provider-success checkmark.
- Strong desktop hierarchy, contrast, action styling, and spacing.

## Test gaps

- No clicked long-page transition asserting scroll reset.
- Cooldown expiry covered only on the recovery route.
- Resume state not tested after completing setup and revisiting an alternative
  connection path.
- Recovery tests do not prove that each named diagnostic is reachable.
- Overflow tests do not measure first-viewport task visibility.
