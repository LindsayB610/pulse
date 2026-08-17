# EU-S — everyday user, impatient scanner

Outcome: completed setup and reached reminder creation, but only by using
browser history to escape the missing-notification recovery.

## Findings

1. **P1 · product truth / status · missing-notification recovery lies about saved progress**
   - Route: `#/selected/state/test-not-received`
   - After the test reaches 6 of 7, recovery drops to 2 of 7 and makes Runner,
     Connect, Delivery, and Test look incomplete while claiming completed work
     remains in place.
   - Browser Back restores the truthful state; the screen offers no direct
     return.

2. **P1 · functional recovery · “Send one more test” does not send or return to a test**
   - Route: `#/selected/state/test-not-received`
   - The action navigates to `#/selected/phone`, “Add your ntfy account,” rather
     than resending or returning to the ready-to-send test screen.
   - Browser history is the only short recovery.

3. **P2 · interaction / functional · “Use a different address” reports an error before input**
   - Route: `#/selected/pairing`
   - The action immediately opens `state/invalid-url` and asserts that an
     address not yet entered is not a Pulse runner.

4. **P2 · interaction / visual · external-handoff confirmation persists across screens**
   - After “Set up with Netlify,” the toast remains fixed across later routes,
     has no dismiss control, and can obscure nearby content.
   - A full reload is required to clear it.

5. **P2 · accessibility · the same external-handoff message is announced twice**
   - The toast has `role="status"` while identical text is also written to
     `#setup-live[aria-live="polite"]`.

## Successful moments

- The first action is obvious and the preparation list scans well.
- The one-task-per-screen phone flow, exact menu names, visual reference, and
  completion criteria work unusually well.
- Explicit Back controls worked.
- The advanced runner path labels itself and offers an escape.
- Ownership, secrets, provider acceptance, and Android receipt are distinguished
  clearly.
- Completion says no sample reminder was created and opens reminder creation.
- Keyboard navigation and routed focus behaved coherently.
