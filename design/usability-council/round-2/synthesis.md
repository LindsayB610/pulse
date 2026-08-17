# Pulse onboarding usability council — round-two synthesis

Nine fresh agent reviewers exercised the same frozen repaired prototype through
three technical personas and three working styles. None saw the first council's
reports or this synthesis. The exercise is a defect-finding gate, not a claim
that unfamiliar humans have completed real ntfy and runner-provider handoffs.

## Judgment

- Reviewers completed: **9 of 9**
- P0 findings: **0**
- Reproduced P1 clusters: **8**
- Additional accepted P2/P3 clusters: **11**
- Accepted clusters fixed: **19 of 19**
- Deferred reproduced product defects: **0**

The visual system was not the weak link. Reviewers consistently liked the
surface orientation, exact phone landmarks, security boundaries, explicit
completion criteria, visible Back controls, and the calm laptop composition.
The remaining failures lived in state truth: a URL could manufacture progress,
a recovery button could promise work it did not do, old scroll could hide the
next task, and a saved timestamp could freeze Test. Those are now modeled as
real transitions rather than inferred from whichever screen happened to render.

## Accepted findings and repairs

Counts are independent reviewers who reported the same underlying problem. A
single report was still accepted when the defect reproduced.

| Finding | Reports | Decision and proof |
| --- | ---: | --- |
| Click navigation retained the previous screen's scroll position | 5 | Fixed. Every route render returns to the top; a real-browser test scrolls the old screen before activating the next action at 1440px and 500px. |
| Test and resend cooldowns became stale or trusted impossible future timestamps | 4 | Fixed. Both Test surfaces tick once per second, expire without reload, and discard stale or future timestamps. |
| Direct URLs, recovery previews, or contradictory saved data could manufacture progress or Ready | 3 | Fixed. Explicit proof flags now gate Runner, Delivery, Test, and Ready; rendering is side-effect free; invalid or unearned routes canonicalize to the last safe checkpoint. |
| Missing-notification recovery named four checks but could not reach Android permission repair | 5 | Fixed. It now offers an actual resend and a Test-stage Android delivery repair covering system permission, topic mute state, and Instant delivery. |
| Advanced compatibility links returned 404 from the documented prototype server | 3 | Fixed. The documented server runs from the repository root, local links are filesystem-checked, and the runner contract remains directly reachable. |
| Browser URL validation admitted local/private aliases and IPv4-mapped IPv6 variants | 3 | Fixed. Origin-only public HTTPS validation rejects loopback, private, link-local, CGNAT, unspecified, mapped IPv6, local aliases, internal suffixes, credentials, paths, queries, and fragments. Native runner verification remains responsible for DNS resolution and redirects. |
| An unsafe runner draft entered browser storage before validation | 1 | Fixed. Draft input survives Back in memory only; only a validated origin is persisted. |
| Restart claimed a deployed/billable runner before one could exist | 1 | Fixed. Restart consequences now depend on whether a provider handoff or verified runner actually exists. |
| Restart feedback leaked into unrelated screens | 3 | Fixed. The result is a one-render notice and is consumed immediately. |
| Unknown or prototype-chain route keys rendered undefined content or left malformed hashes in place | 3 | Fixed. Exact route shapes and own-property checks are required; malformed and unearned routes are replaced with a safe canonical route. |
| Runner-starting “Check again” did not perform a check | 1 | Fixed. The copy now truthfully returns the user to verification and makes clear that no background check occurs in the public prototype. |
| ntfy account verification lacked an exact next action and success criterion | 1 | Fixed. The repair names the account/email task and says precisely when the user is done. |
| Recovery copy reverted to protocol language | 1 | Fixed. User-facing recovery now describes proofs, saved Mac access, compatibility, and migration in task language. |
| Android delivery repair reported the wrong stage | 1 | Fixed. Failure-stage metadata is independent of action destinations and remains at Test, 6 of 7. |
| “What Pulse knows” labels visually fused with their values | 1 | Fixed. Label and value are separate block rows with deliberate spacing. |
| Narrow screens repeated progress and buried the current task | 2 | Fixed. The companion collapses to one compact map; phone substeps use the task eyebrow rather than a duplicate progress block. |
| Companion and task headings repeated the same phrase | 1 | Fixed. The companion provides orientation (“Start in ntfy”); the work pane owns the task heading. |
| Welcome prerequisites and provider timing were understated | 1 | Fixed. The welcome names both provider sign-ins and conditions the 2–4 minute estimate on already being signed in. |
| Literal keyboard operation was asserted but not exercised | 1 | Fixed. An isolated DevTools test sends real Enter, Tab, Shift+Tab, and Escape events through Chrome, including form submission and modal focus containment. |
| Rendered proof could become stale or cropped | 1 | Fixed. The full evidence matrix was regenerated after repair; the renderer supports isolated, named refreshes for later focused changes. |

## Final proof added

The repaired state model has focused tests for explicit progress, semantic
saved-state reconciliation, unearned-route rejection, missing-delivery
revocation, safe draft handling, public-origin attack variants, conditional
restart consequences, single-render notices, exact recovery stages, and live
cooldowns. The browser suites now exercise a complete click path, old-scroll
navigation, narrow progress, real form submission, and native keyboard modal
behavior instead of treating static HTML as functional proof.

The generated evidence covers all selected happy, experienced, phone, and
recovery screens at desktop and narrow widths. The exhaustive real-browser
audit covers every route for page overflow, unexpected initial scroll, clipped
progress, control content overflow, and automated axe violations.

Final post-repair gates:

- **188 core tests plus 1 Netlify integration test passed**;
- **97.17% lines, 84.14% branches, and 95.43% functions** across the main
  coverage run;
- **80.03% lines, 67.18% branches, and 83.09% functions** in the isolated
  Netlify function slice;
- root build, plugin build, root and Netlify typechecks, and clean Git-consumer
  installation passed;
- all-route Chrome accessibility/geometry audit passed in 280 seconds; and
- format, documentation-link, and privacy/public-boundary checks passed.

## Preserved strengths

- The opening screen explains the goal, required accounts, user-owned cost, and
  time expectation without making infrastructure the first task.
- Phone work uses one screen per task, exact ntfy landmarks, an illustration,
  and an explicit “You’re done when” boundary.
- Topic, notification token, runner proof, and Mac credential ownership remain
  separated and explained only where relevant.
- Provider acceptance is never presented as proof that Android displayed a
  notification.
- The guided path and experienced/self-hosted path share the same security and
  delivery proof; expertise changes explanation, not safety.
- Completion creates no fixture reminder, occurrence, or history entry.

## Remaining human gate

The council found and broke implementation logic effectively. It still cannot
prove that an unfamiliar person recognizes ntfy's current Android UI, survives
real provider consent and deployment screens, or returns to Workshop without
coaching. G1 therefore still requires Lindsay plus two unfamiliar
nondevelopers using the unmoderated script against the production-faithful
integration. A blocking failure requires repair and a fresh participant.

## Raw reports

- Everyday user: [methodical](raw/eu-methodical.md), [impatient scanner](raw/eu-scanner.md), [cautious recovery](raw/eu-recovery.md)
- Moderately technical nondeveloper: [methodical](raw/mt-methodical.md), [impatient scanner](raw/mt-scanner.md), [cautious recovery](raw/mt-recovery.md)
- Developer: [methodical](raw/dv-methodical.md), [impatient scanner](raw/dv-scanner.md), [adversarial recovery](raw/dv-recovery.md)
