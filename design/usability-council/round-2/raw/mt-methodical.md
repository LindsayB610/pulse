# MT2-M raw council report

Persona: moderately technical Android/Mac user, comfortable with SaaS accounts
and tokens but not a developer; methodical.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Click-driven route changes preserve the previous scroll position

- Reproduced systemically, directly from `phone` to `phone-reserve`.
- Desktop: `scrollY: 1013.5`, new heading top `-652.5px`.
- 500px: `scrollY: 1407`, new heading top `-741.39px`.
- Source has no route-level scroll reset and focuses with `preventScroll`.
- Recovery requires manually scrolling to the top after each transition.
- Classification: functional orientation and accessibility defect.

### P1 — Runner compatibility/update document is dead in the documented server

- Routes: `state/advanced` and `state/incompatible-runner`.
- Controls resolve `../../docs/guided-byo-setup-plan.md#runner-compatibility-contract`
  to `/docs/...` while the documented server root is `design`, returning 404.
- The real document lies outside that root.
- Recovery requires manually locating the repository document.
- Classification: functional navigation and recovery defect.

### P2 — Failed-delivery recovery covers only two of four named checks

- `test-not-received` names topic, Android permission, subscription mute, and
  Instant delivery.
- “Check my phone setup” opens `phone-subscribe`, which covers topic and Instant
  delivery but not permission or mute.
- A useful `phone-permission` state exists but is not linked.
- Classification: recovery completeness/comprehension defect.

### P2 — Retry countdown displays stale remaining time

- `Try again in 30s` remained unchanged after 2.2 seconds.
- The route only schedules a final expiry rerender.
- Function eventually recovers, but the numeric feedback is false during the
  wait.
- Classification: temporal feedback accuracy defect.

## Strengths

- One-screen-per-step and explicit cross-device handoffs are clear.
- Cost, ownership, quota, and billing boundaries are honest.
- Phone steps contain concrete completion criteria.
- Existing-runner errors, address persistence, and secret exclusion work.
- URL validation and error clearing work.
- Resume and provider cancellation are truthful on tested intermediate state.
- Recovery explains what remains safe.
- Provider acceptance remains separate from human Android receipt.
- Restart consequences and focus handling are strong.
- Narrow layout is coherent when returned to top; console remains clean.

## Test gaps

- Initial route scroll is tested, clicked transition scroll is not.
- Contract-link existence is tested without resolving it against the documented
  server.
- Cooldown coverage checks eventual enablement, not numeric countdown truth.
- Recovery destinations are not checked against every cause their source names.

No P0 findings. No files were edited.
