# DV2-R raw council report

Persona: experienced developer/product-security reviewer; adversarial recovery
pass.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## P1 findings

### Routes and recovery previews can manufacture progress and completion

- Fresh direct `selected/complete` renders “Pulse is ready” without proof.
- Trailing segments still render completion.
- Direct recovery routes persist their displayed checkpoint into local state.
- Ready remains navigable after the user reports a missing test.
- Classification: functional integrity/trust defect.
- Cause: recognized hash routes are not capability-gated and
  `recordSelectedProgress()` promotes rendered routes to saved progress. No
  completion proof exists beyond the route.

### Navigation preserves the previous page scroll

- At 500px, Phone to Reserve retained roughly `scrollY: 1407`, placing the new
  heading 741px above the viewport.
- Classification: usability/accessibility defect.

### Public-origin validation accepts private variants

- Mapped IPv6 private/loopback values and `localtest.me` advanced.
- UI validation cannot be the production SSRF boundary; native/service code
  must resolve and reject private/reserved results and redirects.
- Classification: security-boundary/validation defect.

### Advanced runner contract link is broken

- Both compatibility actions return 404 under the documented `--directory
  design` server.
- Classification: functional developer-onboarding defect.

## P2 findings

### Reset feedback leaks into unrelated screens

- The reset result persists through state routes and into later connection work.
- Expected: show once, then consume on next navigation.

### Android-permission recovery reports the wrong workflow position

- It shows 2 of 7 despite being a Test-stage failure and returning to the
  delivery test.
- Classification: recovery truth/information architecture.

### Stored-state validation is syntactic, not semantic

- Valid-looking contradictory route/index combinations can claim Ready while
  linking earlier.
- Far-future test timestamps can impose arbitrarily long locks.
- Classification: recovery robustness.

## Coverage gaps

- Fresh state cannot access/persist Test or Ready through direct hashes.
- Recovery routes never advance durable progress.
- Missing delivery revokes completion truth.
- Trailing/encoded route segments canonicalize or fail closed.
- Sequential scrolled navigation resets to the new heading.
- Mapped IPv6 and DNS-to-private origins fail at the production boundary.
- Advanced local links resolve through the documented server.
- Notices are consumed exactly once.
- Stored route/index/proof combinations reconcile.
- Future cooldown timestamps clamp.
- Literal browser keyboard input and visible-CTA happy-path activation.

## Strengths

- Normal happy path is concrete and readable.
- Async results do not hijack navigation.
- Pairing secrets remain nonpersistent.
- Provider cancellation is truthful.
- Ordinary private/loopback/credential/path/query origins fail closed.
- Recovery states explain preserved data.
- Advanced setup does not pretend verification is optional.
- Narrow recovery/modal hierarchy remains strong without overflow.
- Serious remaining defects are state truth and navigation, not cosmetic design.

No P0 findings. No files were edited.
