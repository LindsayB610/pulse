# Pulse onboarding usability council synthesis

Nine independent agent reviews exercised the same frozen public prototype from
three technical personas and three working styles. The council is a defect-
finding preflight, not evidence that unfamiliar humans can complete the real
provider handoffs.

## Result

- Reviewers completed: **9 of 9**
- P0 findings: **0**
- Reproduced P1/P2 problem clusters: **15**
- Accepted problem clusters fixed in this pass: **15**
- Known external limitation: the public prototype simulates provider and runner
  responses; production must prove those responses through the native/cloud
  contracts before it may claim connection or delivery.

The strongest consensus was not about styling. The interface explained a
careful system while several controls implemented a shortcut-shaped fiction.
The repaired prototype now models those interactions instead of merely
rendering their promised end states.

## Reproduced findings and decisions

Counts show independent reports out of nine. A lower count did not excuse a
reproducible defect.

| Finding | Reports | Decision and proof |
| --- | ---: | --- |
| Missing-notification retry returned to Phone and erased Test progress | 9 | Fixed. Retry sends again, returns to the test receipt screen, and keeps Test at 6/7. |
| Runner verification accepted malformed, insecure, local, credentialed, or path-bearing URLs | 7 | Fixed. A submitted public HTTPS origin is required; errors stay inline, preserve the value, receive focus, and send no proof. Connected identity is derived from the validated origin. |
| Recovery labels promised different actions but shared destinations | 8 | Fixed. Every two-action recovery now has distinct route, external handoff, documentation, or resend consequences, enforced table-wise. |
| Existing-Pulse path promised a pairing code but exposed no code field | 6 | Fixed. The path collects runner origin plus a one-use ten-minute code and never persists that code in browser storage. |
| Recovery progress followed its CTA destination rather than preserved work | 7 | Fixed. Each recovery owns explicit failure-stage metadata independent of its actions. |
| Resume/progress preservation was claimed but not modeled | 5 | Fixed for the public prototype's safe state. It stores the furthest stage, last safe route, runner address/name, and test-attempt count only. Pairing codes and notification secrets are excluded. Reviewing an earlier step cannot erase or relock the furthest checkpoint. |
| External handoff feedback persisted, obscured later work, or announced twice | 9 | Fixed. One live announcement is emitted, the visual toast is hidden from assistive technology, clears on navigation, and expires. |
| Restart allowed focus escape or left contradictory saved-state language | 4 | Fixed. The background becomes inert, Tab is contained, Escape restores focus, local state is removed, and the remaining provider deployment/billing consequence is stated. |
| Skip to setup escaped the selected journey into the internal design study | 2 | Fixed. It now keeps the route and moves focus to the selected setup region. |
| Normal Advanced/existing choices were framed as failures | 4 | Fixed. Intentional branches use neutral setup hierarchy and preserve verification requirements. |
| Advanced setup listed requirements without an actionable compatibility contract | 2 | Fixed. It links directly to the public runner contract and still routes through validation. |
| Phone/provider instructions were ambiguous or misleading | 6 | Fixed. The flow exposes account creation, Android-neutral QR language, Instant delivery outcomes, token-revocation consequences, provider permission/team/price expectations, and an unmistakably disabled QR preview. |
| Phone test mock implied that Android could confirm a receipt Pulse cannot observe | 2 | Fixed. The mock tells the user to return to Workshop; only Workshop presents the human confirmation. |
| Empty dashboard showed zero reminders beside a due fixture reminder | 1 | Fixed. The empty state contains no saved reminder or next notification. |
| Narrow progress was clipped or required a mystery horizontal swipe | 2 | Fixed. Both selected and recovery progress use a complete two-row map at 500px with no horizontal scroll. |

Additional single-report copy defects were also corrected: the welcome estimate
now accounts for normal setup friction, `webview` and avoidable protocol jargon
were removed from user-facing completion text, fingerprint safety copy no
longer pretends that a public identity request sent nothing, and route changes
no longer draw an outline around the entire main region.

## Preserved strengths

All personas independently recognized the same useful foundations:

- the first screen explains the outcome, required devices, user-owned provider
  account, and cost boundary;
- phone work is split into literal screens with exact landmarks and visible
  completion criteria;
- topic, notification token, runner proof, and Mac credential boundaries are
  explained where each matters;
- provider acceptance is not presented as Android receipt;
- every main task has an obvious Back control;
- the recommended path does not erase the compatible/self-hosted path; and
- completion creates no fake reminder, occurrence, or history item.

## Regression coverage added

Mounted interaction tests now cover URL validation, Enter submission, error
focus, value preservation, identity derivation, one-use pairing-code entry,
safe resume state, non-regressing review navigation, recovery-stage semantics,
distinct recovery consequences, real resend behavior, live-region lifecycle,
restart focus containment, destructive-state truth, user-facing copy, and the
empty dashboard.

An isolated real-Chrome interaction suite repeats the consequential flows at
1440px and 500px. The exhaustive route audit covers all happy, experienced,
and recovery routes at both widths with axe and shared visual contracts. The
rendered evidence set was regenerated after the fixes.

## What remains for humans

Agent reviewers can expose contradictions, missing controls, weak recovery,
and test blind spots. They cannot prove that an unfamiliar person understands
provider consent, recognizes ntfy's current Android UI, or returns from a real
browser handoff without coaching. The remaining G1 gate is Lindsay plus two
unfamiliar nondevelopers using the unmoderated script against the production-
faithful integration. Any blocker requires a fresh participant retest.

## Raw reports

- Everyday user: [methodical](raw/eu-methodical.md), [impatient scanner](raw/eu-scanner.md), [cautious recovery](raw/eu-recovery.md)
- Moderately technical nondeveloper: [methodical](raw/mt-methodical.md), [impatient scanner](raw/mt-scanner.md), [cautious recovery](raw/mt-recovery.md)
- Developer: [methodical](raw/dv-methodical.md), [impatient scanner](raw/dv-scanner.md), [adversarial recovery](raw/dv-recovery.md)
