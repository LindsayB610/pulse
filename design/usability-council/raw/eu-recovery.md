# EU-R — everyday user, cautious recovery

Outcome: would stop without outside help at Create your runner. The happy path
became traversable only because the prototype allows unverified claims of
external completion. Recovery testing exposed multiple interaction failures.

## P1 findings

1. **Functional / accessibility · Skip to setup opens the internal design study**
   - Route: `#/selected/welcome`
   - The skip link changes the route to `#setup-root` and renders Direction A,
     direction tabs, and the internal recovery-state index instead of moving
     focus within the selected journey.

2. **Functional validation / product truth · pairing accepts an invalid address**
   - Route: `#/selected/pairing`
   - Entering `not a website` and activating “Verify and connect this runner”
     advances to Delivery because the action is an anchor, not validated submit.

3. **State persistence / product truth · leave-and-resume is promised but not preserved**
   - No local/session state or automatic resume exists. Returning to Welcome
     starts at Phone; the resume experience is only a manually addressed fixture.

4. **Functional recovery / state · test-not-received resets to Phone and misroutes retry**
   - Progress falls from 6 of 7 to 2 of 7, and both recovery actions return to
     Phone instead of providing phone troubleshooting plus a new test.

5. **Missing functionality · existing-Pulse flow omits its promised pairing code**
   - The flow promises runner address plus ten-minute code but opens the generic
     URL-only pairing screen.

6. **Functional recovery / interaction · multiple recovery labels have false destinations**
   - “Return to Netlify,” “Open ntfy account,” “Return to your provider project,”
     “Open update instructions,” “Open diagnostics,” “Repair ntfy access,” and
     “View migration details” all route to ordinary internal steps rather than
     the distinct help or external destinations they promise.

7. **Accessibility / interaction · restart modal does not trap focus**
   - After “Start over,” the second Tab moves behind the open modal to Skip to
     setup. Escape does close and restore focus correctly.

8. **Instruction / comprehension · recommended Netlify handoff is insufficient**
   - “Git-provider permission,” “team you own,” quota, billing, project creation,
     plan selection, and team scope are not explained enough for this persona to
     continue without outside help.

## P2 findings

9. **Trust / security explanation · permanent token guidance omits revocation consequence**
   - “Never expires” and “You can revoke the token later” do not explain that
     revocation stops delivery until a replacement is saved.

10. **Instruction · Android guidance assumes Pixel and uses “doze mode” jargon**

11. **Cross-device interaction · phone mock competes with Workshop confirmation**
    - The phone illustration shows Confirm test and Dismiss while the real flow
      requires “I got it” in Workshop.

12. **Product truth / destructive copy · stale-setup safety text contradicts restart consequence**
    - One message implies abandoning the deployment; the modal correctly says
      only local setup is abandoned and the provider deployment may keep running.

13. **Interaction label · “Use a different address” opens an error instead of editing**

14. **Comprehension · recovery language remains developer-shaped**
    - Examples: “CURRENT TRUTH,” “native setup key,” “Pulse protocol status,”
      “health endpoint,” “origin-bound proof,” “durable credential,” and schema
      migration notation.

15. **Accessibility · external handoff status is announced twice**

16. **Prototype integration · completion links 404 under the isolated root**
    - `Create a reminder` and `View empty dashboard` target `/prototype/index.html`;
      this may be a hosting-root assumption rather than a production defect.

## Successful recovery behavior

- Selected steps have visible and accurately labeled Back controls.
- Account confusion, authorization, Android permission, invalid address, and
  identity mismatch provide useful safety explanations.
- Test copy distinguishes provider acceptance from Android receipt.
- Restart warns about continuing provider billing, makes the safe action primary,
  and restores focus after Escape.
- Delivery failures say what remains safe and whether data was created.

No P0 security or data-loss issue surfaced. The repeated defect is that the UI
says progress and security are preserved while its navigation does not prove it.
