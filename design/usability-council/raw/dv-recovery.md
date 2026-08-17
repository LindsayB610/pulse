# DV-R — developer, adversarial recovery

Outcome: happy path reaches completion, but functional/recovery gate fails. No
P0; six P1 clusters.

## P1 findings

1. **Accessibility / interaction · Skip to setup exits selected mode**
   - `href="#setup-root"` is consumed by the hash router and opens the design-study
     route instead of moving focus within the selected journey.

2. **Functional / security truth · malformed and insecure runner URLs verify**
   - Enter does nothing; clicking verify accepts HTTP, paths, credentials, query,
     fragments, and malformed origins, then declares a hard-coded runner connected.

3. **Functional blocker · existing-Pulse flow has no pairing-code input**

4. **Functional recovery · missing-test retry returns to Phone and cannot resend**

5. **Accessibility · restart modal permits focus escape**

6. **Lifecycle / product truth · abandoning local setup can orphan a billable runner
   and leaves a contradictory saved-state toast**

## P2 findings

7. **Interaction system · seven recovery action pairs share false destinations**

8. **Status · recovery progress follows destination instead of preserved state**

9. **Status · external-handoff toast never expires or clears on route change**

10. **Narrow interaction · active progress step begins clipped**
    - The audit allowlists companion-list overflow without checking active-item
      visibility.

11. **State preservation · correction loses the offending runner value**

12. **Security copy · fingerprint mismatch says nothing was sent**
    - Fetching a public fingerprint requires a request; the safe claim is that no
      secret, private proof, or durable credential was sent.

13. **Interaction · “Use a different address” creates an error instead of editing**

14. **Hierarchy · Advanced and existing-installation choices render as failures**

15. **Prototype fidelity · async verification/test behavior is absent**
    - No submitting state, duplicate suppression, timeout, cancellation, or real
      resend rate-limit behavior is represented.

## P3 finding

16. **Expectation setting · eight-minute estimate assumes frictionless ready accounts**

## Test gaps

- Skip-link mode preservation; typed URL matrix; Enter/error focus; value and
  identity preservation; pairing-code lifecycle; exhaustive action consequences;
  retry state; modal containment/inertness; toast lifecycle; async/rate-limit
  behavior; active-step visibility; diagnostics/migration details; network-aware
  security wording.

## Strengths

- Phone and secret guidance, privacy refusal, human delivery confirmation, Back,
  route reload, safety copy, responsive composition, and public/private boundaries
  are strong and should be preserved.
