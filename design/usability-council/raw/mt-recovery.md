# MT-R — moderately technical nondeveloper, cautious recovery

Outcome: copy and security model are strong, but wiring defects would waste
scarce human-review time and corrupt usability evidence.

## Findings

1. **P1 · functional / security truth · insecure runner URLs verify**
   - `http://not-secure.example/redirect` advances to a connected state; invalid
     input never triggers the separately rendered invalid-address recovery.

2. **P1 · missing workflow · existing-Pulse connection lacks pairing-code UI**

3. **P1 · recovery / state truth · missing-notification recovery loses place and cannot resend**

4. **P1 · persistence / product truth · leave-and-resume is not implemented**
   - Reopening the onboarding URL returns to comparison; local/session storage is
     empty and the resume screen is a static fixture.

5. **P1 · consequence truth · restart confirmation leaves a contradictory saved-state toast**
   - After Abandon local setup, Welcome still says setup remains saved.

6. **P2 · interaction system · recovery buttons do not perform labeled actions**
   - Android instructions, ntfy account, ntfy options, Netlify, runner update,
     provider project, diagnostics, and migration-detail actions collapse into
     generic internal destinations.

7. **P2 · state model · recovery progress follows CTA target, not completed state**

8. **P2 · feedback / obstruction · external-handoff toast never clears**

9. **P2 · security comprehension · Git-provider permission lacks scope details**

10. **P2 · interaction semantics · distinct actions have duplicate behavior**
    - Proof-failed and test-rejected action pairs share destinations without a
      behavioral distinction.

11. **P3 · expectation setting · eight-minute estimate assumes ready accounts**

12. **P3 · comprehension · normal pairing copy leaks protocol vocabulary**

## Successful moments

- Billing, ownership, phone completion criteria, protected-topic boundaries,
  token handling, one-use delivery handoff, provider-vs-phone test proof, restart
  consequences, and no-fixture completion are unusually clear.
- Authorization, unavailable adapter, team permission, invalid URL, identity,
  proof, storage, startup, rejected test, migration, and advanced requirement
  states generally explain what remains safe and preserved.

No P0 issue surfaced.
