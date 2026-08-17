# EU-M — everyday user, methodical

Outcome: completed the simulated happy path and reached both post-setup
destinations. Four defects could materially prevent or derail a real first-time
user.

## Findings

1. **P1 · instruction / functional · no path to create the ntfy account**
   - Route: `#/selected/welcome` → `#/selected/phone`
   - The UI immediately says “Add your ntfy account” and requests an ntfy
     username and password, but never explains how to create that account or
     offers a visible creation path.
   - Recovery requires leaving Pulse and guessing where to create an account.

2. **P1 · functional / interaction · missing-notification retry returns to the beginning**
   - Route: `#/selected/test-sent` → `It did not arrive` →
     `#/selected/state/test-not-received`
   - “Send one more test” changes progress from 6 of 7 to 2 of 7 and links to
     `#/selected/phone` rather than resending or returning to the test screen.
   - Only browser Back or replaying intervening screens recovers.

3. **P1 · functional / interaction · visible progress navigation loses the current place**
   - Route: `#/selected/pairing`
   - Revisiting the completed Phone step makes Connect noninteractive, reports
     2 of 7, and provides no visible return to the prior current step.
   - Browser Back or replaying the flow recovers.

4. **P1 · functional / instruction · existing-Pulse branch omits its promised pairing code**
   - Route: `#/selected/welcome` → `Connect an existing Pulse` →
     `#/selected/state/existing-installation`
   - The branch promises a runner address and ten-minute pairing code, but its
     pairing screen contains only the runner-address input.
   - The described task cannot be completed.

5. **P2 · interaction / instruction · “Use a different address” declares an error without validation**
   - Route: `#/selected/pairing`
   - The action routes directly to `state/invalid-url`, which asserts that the
     address is not a Pulse runner.

6. **P2 · instruction / interaction · normal alternatives use failure language**
   - Routes: `#/selected/state/advanced` and
     `#/selected/state/existing-installation`
   - Both render under “Fix this without starting over” and “Recovery keeps
     completed work” even though no failure occurred.

7. **P2 · functional / interaction · fingerprint recovery actions are indistinguishable**
   - Route: `#/selected/state/fingerprint-mismatch`
   - “Return to your provider project” and “Enter a different address” both
     route internally to `#/selected/pairing`.

8. **P2 · instruction · Android instructions assume a Pixel**
   - Route: `#/selected/phone-subscribe`
   - “Use your Pixel camera” is falsely specific in Android onboarding.

9. **P2 · accessibility / interaction · external handoffs announce status twice**
   - Every simulated external handoff renders the same status in an
     `aria-live="polite"` element and a separate `role="status"` toast.

10. **P2 · functional / visual · empty dashboard contradicts itself**
    - Route: `#/selected/complete` → `View empty dashboard`
    - It shows zero active reminders and “Nothing scheduled” alongside “Next
      notification — Due now — Take recycling out.”

11. **P2 · instruction · recommended runner handoff exposes unexplained provider language**
    - Route: `#/selected/runner`
    - “Git-provider permission,” “team you own,” and “quota” are not explained
      sufficiently for the persona.

12. **P3 · instruction · “About 8 minutes” assumes both accounts already exist**
    - Route: `#/selected/welcome`
    - The estimate excludes account creation, verification, provider signup,
      deployment, pairing, delivery configuration, and the phone test.

## Successful moments

- The welcome screen states the goal, devices, ownership, and user-paid provider
  boundary clearly.
- Phone steps have literal instructions, visual replicas, and “You’re done when”
  criteria.
- Privacy boundaries appear when they matter.
- Netlify is recommended without hiding the compatible-runner path.
- Pairing explains why redirects and identity mismatches are blocked.
- Provider acceptance is distinguished from Android receipt.
- Completion states that no fake reminder was added.
- Explicit Back buttons, focus order, focus indicators, and input labeling worked.
- The happy path completed; missing-notification recovery and existing-installation
  did not.
