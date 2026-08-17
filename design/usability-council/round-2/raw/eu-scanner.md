# EU2-S raw council report

Persona: everyday Android/Mac user with low technical confidence; scans
headings and prominent controls and skips most supporting copy.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Missing-notification recovery does not diagnose the failure

- Route: `#/selected/state/test-not-received`.
- Task: recover when a sent test does not appear on Android.
- Expected: a short path through the named topic, Android permission, mute, and
  Instant delivery checks, followed by a direct return to the delivery test.
- Observed: “Check my phone setup” routes to `phone-subscribe`, which covers
  subscription and Instant delivery only. Its primary action advances to token
  creation rather than returning to Test.
- Recovery: partial. A careful user may use the progress map, but the primary
  recovery path pushes an impatient user backward through completed setup.
- Classification: functional recovery defect.
- Evidence: `test-not-received` targets `phone-subscribe`, despite the separate
  `phone-permission` recovery containing the Android settings path and a return
  to the delivery test.
- Test gap: existing coverage asserts the current destination but does not prove
  a user can diagnose all named causes and return to Test.

### P2 — Recovery status labels concatenate with their values

- Routes: all `#/selected/state/*`; clearest on `test-not-received` at 500px.
- Expected: the yellow eyebrow and white value read as separate levels.
- Observed: `WHAT PULSE KNOWSProvider accepted delivery…` reads as one malformed
  sentence.
- Recovery: content remains decipherable but scanning slows.
- Classification: systemic visual hierarchy/readability defect.
- Source confirmation: the inline-flex label has bottom margin but does not
  force the following value to a new line.
- Test gap: overflow and axe checks do not catch this relationship.

## Strengths

- Completed the happy path using headings and primary controls alone.
- One screen per step, specific Back controls, and visible prerequisites work.
- External handoffs remain honest simulations.
- Provider cancellation reports that no runner connected.
- Runner and pairing errors are specific and clear on correction.
- Existing-runner setup is visibly separate.
- Recovery reload and resend countdown worked on the tested path.
- Human receipt confirmation prevents false delivery success.
- No document-level narrow overflow or console errors.
- Advanced setup is clearly marked with an obvious guided escape.

No P0 findings. No files were edited.
