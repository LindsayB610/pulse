# MT2-S raw council report

Persona: moderately technical Android/Mac user, not a developer; scans quickly
and expects state and shortcuts to be truthful.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Restart invents a deployed runner before one exists

- After entering only Phone and returning to Welcome, “Start over instead”
  opens “Keep or abandon the deployed runner?” and warns about provider quota.
- Confirming says the provider runner was not deleted even though no runner
  handoff occurred.
- Cancellation is safe, but the user cannot know the billing warning is false.
- Classification: consequential product-truth/state-model defect.
- Source confirmation: modal and result copy are unconditional; setup state does
  not distinguish phone-only progress, provider handoff, verified runner, or an
  existing runner.

### P1 — Missing-notification recovery cannot reach Android permission repair

- `test-not-received` names Android permission among likely causes.
- “Check my phone setup” opens only `phone-subscribe`, which covers topic and
  Instant delivery.
- A complete `phone-permission` recovery exists but has no inbound user path.
- Classification: functional recovery/information-architecture defect.

### P2 — Restart result is not a one-screen notice

- “Local setup removed…” follows from Welcome into the existing-installation
  recovery and onward until reload.
- Recovery routes do not consume the transient notice.
- Classification: transient-state lifecycle defect.

### P3 — Welcome understates account prerequisites

- “A browser sign-in” hides separate ntfy and runner-provider sign-ins plus
  possible verification, authorization, and team selection.
- Classification: expectation-setting copy.

### P3 — “About 2–4 min” needs a condition

- The Netlify estimate reads as total elapsed time despite sign-up and provider
  authorization branches.
- Classification: trust/copy risk.

## Strengths

- Full guided path completed cleanly.
- Provider acceptance remains distinct from Android receipt.
- Safe state survives Back/reload/resume.
- Existing-runner address persists and pairing code does not.
- Invalid origins and correction behavior work.
- Confirmation modal controls and safe default are clear.
- Cost, ownership, secrets, Keychain, revocability, and advanced requirements
  are understandable.
- Desktop and isolated 500px presentation are visually coherent with no
  clipping or horizontal overflow.
- Experienced shortcut is discoverable but secondary.

## Test gaps

- No early-progress restart proving provider/quota warnings are absent.
- Missing-notification test currently locks in the permission dead end.
- No one-render lifecycle test for notices across recovery routes.

No P0 findings. No files were edited.
