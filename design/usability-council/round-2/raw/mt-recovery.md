# MT2-R raw council report

Persona: moderately technical Android/Mac user, not a developer; cautious and
recovery-focused.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Step navigation carries old scroll into the new screen

- `phone` to `phone-reserve` opened at `scrollY: 1507` at 500px and 1013.5 at
  desktop width.
- `test-sent` to `test-not-received` and Back also retained nonzero scroll.
- New headings and instructions can be far above the viewport.
- Recovery is manual scrolling with no cue.
- Classification: functional usability/accessibility defect.

### P2 — Missing-test diagnosis has an incomplete repair path

- Names topic, Android permission, subscription mute, and Instant delivery.
- “Check my phone setup” reaches only subscription/topic and Instant delivery.
- Dedicated permission recovery exists but is not linked.
- Classification: recovery-flow gap.

### P2 — Runner-starting copy contradicts available behavior

- Says Pulse stops after a bounded wait and shows attempt 2 of 6.
- No countdown, automatic update, or checking action exists. “Check again” only
  returns to Pairing, where another submit is required.
- Classification: state-truth and recovery clarity defect.

### P2 — Account-verification recovery lacks a concrete task

- Says to finish ntfy verification but gives no likely provider action, UI
  location, or “done when” condition.
- “Check again” advances to topic reservation regardless of readiness.
- Classification: instruction clarity and likely abandonment point.

### P3 — Unknown recovery hashes show Resume without canonicalizing the URL

- `state/does-not-exist` retains the invalid hash while rendering a saved-state
  message.
- Normal controls still work, but corrupt deep links become harder to diagnose.
- Classification: defensive routing polish.

## Strengths

- Unsafe/internal origins are rejected and correction clears errors.
- Existing address persists while pairing code does not.
- Pairing errors are clear and provider cancellation is truthful.
- Restart confirmation states provider resource consequences.
- Test notifications do not create reminder/history fixtures.
- Cooldown survives reload and works on the tested recovery route.
- Android receipt requires human confirmation.
- Recovery generally states what is preserved.
- Console, semantics, and layout remain clean once returned to the top.

No P0 findings. No files were edited.
