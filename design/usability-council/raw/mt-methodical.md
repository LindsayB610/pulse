# MT-M — moderately technical nondeveloper, methodical

Outcome: completed the happy path and both completion handoffs. No real
credentials, subscriptions, or deployments were created.

## Findings

1. **P1 · functional · runner verification accepts invalid input and reports false secure connection**
   - `not a url` advances from Pairing to Delivery, which reports Runner
     connected and secure access. The verify control is an unconditional link.

2. **P1 · broken recovery · “Send one more test” returns to Phone**
   - Test progress falls from 6/7 to Phone 2/7; both recovery actions share the
     same destination. Browser history is the only short recovery.

3. **P2 · instruction / recovery · “Not authorized” can loop**
   - It says a saved user may be missing, incorrect, or unused without explaining
     how to verify or select which user the protected subscription uses.

4. **P2 · misleading action · provider-project recovery and address correction are identical**
   - On fingerprint mismatch, both actions route to Pairing.

5. **P2 · product truth · leave-and-resume is promised but not demonstrated**
   - Fresh entry does not resume; only a static manually addressed resume state
     exists.

6. **P2 · interaction feedback · simulated-handoff toast never dismisses**

7. **P2 · progress truth · compatible-runner alternative advances to Connect before validation**
   - Opening Advanced activates Connect 4/7 although no address or compatibility
     has been checked.

8. **P3 · inclusive language · phone instructions say Pixel instead of Android phone**

9. **P3 · visual / focus · every render outlines the entire focused main region**
   - The generic focus-visible rule gives `main#setup-root` a conspicuous full-page
     outline after route changes.

10. **P3 · copy · “No token copying” conflicts with adjacent ntfy token copying**
    - The sentence means the Mac credential but does not name it.

## Successful moments

- Welcome, phone substeps, completion criteria, prototype-only data, and secret
  boundaries are clear.
- Recommended and advanced runner paths are visually distinct.
- Normal Back controls work.
- Test copy distinguishes provider acceptance from Android receipt.
- Completion creates no fake reminder/history and its downstream links work when
  served from the correct design root.
