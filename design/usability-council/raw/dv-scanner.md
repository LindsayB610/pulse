# DV-S — developer, impatient scanner

Outcome: visual and instructional happy path is strong, but the prototype is not
implementation-ready. It proves rendering more thoroughly than several promised
workflows.

## Findings

1. **P1 · functional / false security · invalid runner URL verifies**
   - `http://localhost:8888/api` advances to Runner connected, discards the value,
     and restores the fixture identity.

2. **P1 · functional completeness · existing-Pulse flow lacks pairing-code entry**

3. **P1 · recovery / dishonest progress · missing-test retry returns to Phone**
   - Both actions go to Phone and progress falls from 6/7 to 2/7.

4. **P2 · interaction system · eight recovery states have distinct labels but duplicate destinations**
   - ntfy verification, provider authorization, incompatible runner, fingerprint
     mismatch, proof failed, test rejected, test not received, and migrated setup
     contain cosmetic action pairs.

5. **P2 · instruction / affordance · Advanced is requirements, not an actionable contract**

6. **P2 · product truth · resume is asserted but not modeled**

7. **P2 · cross-device interaction · test-notification mock contradicts Workshop confirmation**
   - Phone mock shows Confirm test although copy says receipt must be confirmed in
     Workshop.

8. **P2 · state model · recovery progress follows destination rather than preserved work**

9. **P2 · accessibility · destructive modal lacks focus containment**

10. **P2 · feedback · external-handoff toast persists across routes**

11. **P3 · narrow interaction · companion progress overflows without visible affordance**
    - The 500px audit allowlists the overflow and therefore cannot catch clipped
      labels/focus.

## Test gaps

- No browser click-through happy path or typed URL validation matrix.
- No Back/value preservation test.
- No existing-installation pairing-code interaction test.
- No exhaustive recovery action/destination contract.
- No recovery-stage semantics or resume-persistence test.
- No notification-mock contract, toast lifecycle, or modal focus-trap test.

## Successful moments

- Welcome, four focused phone screens, public-fixture safety, architectural
  requirements, Back placement, security boundaries, written receipt truth,
  no-fixture completion, and restart consequence framing should be preserved.
