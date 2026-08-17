# Pulse Guided Setup: G1 Experience Directions

This is a public-safe, fixture-driven comparison for Pulse's first-run setup
inside Workshop. It does not call a runner, open a real provider account, or
contain a real topic, endpoint, token, path, reminder, or history item.

G0 established the system truth in
[`docs/guided-byo-setup-g0.md`](../docs/guided-byo-setup-g0.md). The prototype
tests three ways to organize that same truth. They are interaction structures,
not visual themes.

**Selected direction:** a phase-aware Companion Split View. The structural
direction was selected by the product owner on 2026-08-15, but its first owner
walkthrough failed at the original welcome screen and reopened the G1 gate.
The revised version begins with a focused doorway and introduces the companion
only when cross-device work starts. Experienced-user exits remain quiet and may
skip provider tutorials; they may not bypass runner identity, origin-bound
pairing, native credential storage, or confirmed notification delivery.

## Run the prototype

From the Pulse repository root:

```sh
python3 -m http.server 4179 --bind 127.0.0.1
```

Open `http://127.0.0.1:4179/design/onboarding-prototype/#/compare` for the decision archive. Use
`http://127.0.0.1:4179/design/onboarding-prototype/#/selected/welcome` for the clean participant
walkthrough; it contains no direction switcher or research prompt.

The evidence set can be regenerated with:

```sh
npm run design:setup-render
```

## Direction A — Guided Journey

**Thesis:** One calm decision at a time.

A persistent seven-step rail frames one focused job. Each screen leads with the
outcome, names the active surface, explains what stays protected, and offers a
primary continuation plus one recovery route.

Strengths:

- lowest first-run cognitive load;
- clearest single primary action;
- strongest separation between explanation and action;
- easy to keep honest when a provider handoff is still pending; and
- most resilient at a narrow Workshop width.

Tradeoffs:

- the whole system is less visible at a glance;
- users who already understand the setup may feel constrained; and
- repair actions need a separate state catalog or Settings entry.

## Direction B — Readiness Board

**Thesis:** See the whole system become ready.

Phone, Runner, Secure delivery, and Proof remain visible as dependency cards.
The current work appears below them with a persistent explanation panel.

Strengths:

- strongest overview of system readiness;
- natural home for resume, repair, and partial completion;
- independent provider steps can become reorderable later; and
- state language is difficult to hide behind an optimistic stepper.

Tradeoffs:

- highest information density;
- the active work competes with system status on a first run;
- long phone/provider instructions make the page tall; and
- a nontechnical user may read the cards as four simultaneous obligations.

## Direction C — Companion Split View

**Thesis:** Keep context beside the active work.

A persistent companion column explains the cross-device journey while the
active task occupies the larger work pane. It is intentionally laptop-native
and makes browser return especially legible.

Strengths:

- best use of the Mac viewport;
- strongest browser/phone/Workshop orientation;
- excellent context during waiting and return states; and
- the setup map remains visible without dominating the work.

Tradeoffs:

- repeated context consumes meaningful width;
- narrow windows must collapse the companion into a compact horizontal map;
- dense steps can create long right-hand panes; and
- the secondary column may feel heavy after the mental model is learned.

## Decision rubric

Each direction is scored from 1–5 using the same evidence. Visual novelty is
not a criterion.

| Criterion | Weight | Passing proof |
| --- | ---: | --- |
| First-run comprehension | 25% | User can explain phone, runner, ownership, and proof without product-team translation. |
| Handoff clarity | 20% | User always knows whether the next action is on this Mac, in a browser, or on Android. |
| Error and resume scalability | 15% | Recovery preserves completed work and does not collapse into generic errors. |
| Primary Mac composition | 15% | 1280–1440px layout has intentional hierarchy, readable lines, and no dead acreage. |
| Security comprehension | 10% | User understands where the ntfy token goes without learning internal credential mechanics. |
| Accessibility and narrow resilience | 10% | Keyboard, landmarks, zoom, reduced motion, and narrow layouts use the same information model. |
| Production fidelity | 5% | Every success state maps to a real future native/cloud contract. |

A direction cannot win with a weighted average below 4.0, any criterion below
3, an accessibility blocker, a secret-boundary violation, or a workflow that
requires documentation.

### Internal product and design review

The first complete review used every happy-path screen, the full recovery
catalog, desktop and narrow renders, the 200% zoom stress render, scripted DOM
walkthroughs, and real-Chrome axe/overflow results. These scores are an
evidence-based recommendation, not a substitute for the required unfamiliar
participant tests.

| Direction | Comprehension | Handoffs | Error/resume | Mac composition | Security | Accessibility | Fidelity | Weighted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A — Guided Journey | 4.8 | 4.8 | 4.2 | 4.6 | 4.8 | 4.8 | 4.8 | **4.68** |
| B — Readiness Board | 3.8 | 4.4 | 4.9 | 4.6 | 4.5 | 3.9 | 4.8 | **4.34** |
| C — Companion Split View | 4.4 | 5.0 | 4.6 | 5.0 | 4.8 | 4.0 | 4.8 | **4.66** |

**Decision:** promote Direction C with phase-aware progressive disclosure. The
welcome screen is a single-task doorway with one primary action and two quiet
existing-runner exits. The companion appears after setup begins, when the user
must move between Workshop, a browser, and Android. It names the current
physical surface and action instead of explaining the interface. This gives a
capable operator a shorter route without turning future security steps into
jump links. Direction B remains the best reference for post-setup repair status
rather than first-run onboarding.

Review defects were fixed before this checkpoint: anchor specificity no longer
breaks primary-action contrast, long generated topics are contained without
page overflow, and every direction now has a valid heading hierarchy. Seven
representative routes pass real-Chrome axe checks with contrast enabled and
have no page-level overflow at 1440px or 500px. All three complete paths and
all twenty-one recovery routes also pass scripted interaction checks.

A fresh nine-reviewer retest then attacked the repaired selected flow. Its
[round-two synthesis](usability-council/round-2/synthesis.md) records the
state-model, recovery, navigation, validation, and narrow-hierarchy defects
found and fixed after the frozen review. The complete route matrix now receives
real-browser overflow and axe checks, and consequential keyboard behavior is
exercised with native Chrome key events.

## Complete state catalog

Every direction renders the seven-step happy path:

1. ownership and welcome;
2. phone preparation across four explicit screens: add the ntfy Android user,
   reserve the private topic, subscribe with instant delivery, and create the
   runner token;
3. runner selection and provider deployment;
4. runner identity verification and native pairing;
5. runner-owned notification-secret capture;
6. isolated test notification and human confirmation; and
7. connected completion into first-reminder creation.

Every direction also accepts the same recovery states: resume, Android
permission denial, missing Android user, protected-topic authorization,
ntfy verification, unavailable private topic, unavailable
quick adapter, provider authorization, provider team denial, invalid URL,
incompatible runner, fingerprint mismatch, failed proof, native secure-storage
failure, runner startup delay, provider test rejection, missing phone receipt,
connect-existing, stale pending setup, migrated pending setup, and Advanced
self-hosting.

## Unmoderated task script

The observer reads only this prompt:

> You want Pulse to remind you on your Android phone even when your Mac is
> asleep. Starting here, set up a new Pulse using fictional test accounts.
> Stop when the product says the phone received a setup test. Say what you
> expect each button to do before using it.

Rules:

- the observer may not tell the participant where to click;
- the observer may not translate `runner`, provider permission, private topic,
  pairing, or any other product language;
- the observer may respond to a direct question only with “What would you
  expect the product to do?”;
- provider wait time is excluded from active time but every wrong turn is
  recorded;
- credentials, account identifiers, private topics, and real reminders are
  never recorded; and
- a participant who has learned the repaired flow cannot serve as the fresh
  retest participant.

Tasks:

1. explain what Pulse needs and who may charge money;
2. prepare the fictional phone subscription;
3. choose and deploy a user-owned runner;
4. return to Workshop and connect it;
5. finish notification access without entering the token into Pulse;
6. confirm a test notification;
7. explain what remains in each provider account after abandoning setup; and
8. find the recovery path for a blocked Android permission and a mismatched
   runner.

## Observation record

Use one redacted row per participant and direction.

| Field | Record |
| --- | --- |
| Participant | `P1`, `P2`, or `owner` only |
| Direction | A, B, or C |
| Prior Pulse use | yes/no |
| Software developer | must be no for P1 and P2 |
| Active time | exclude provider wait |
| Completed without intervention | yes/no |
| Reached confirmed test notification | yes/no |
| Wrong turns | action and visible state, no account data |
| Questions asked | exact question, redacted |
| Ownership/cost explanation | participant's paraphrase |
| Token-boundary explanation | participant's paraphrase |
| Accessibility observations | keyboard, zoom, screen reader, motion |
| Blocking issue | yes/no and state |
| Retest required | yes/no |

The minimum record is Lindsay plus two unfamiliar nondevelopers. Both
unfamiliar participants must reach the confirmed test notification without
observer intervention, a terminal, raw JSON, or external documentation.

### Owner observation 1 — failed doorway

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, original always-visible companion |
| Completed without intervention | no |
| Wrong turn | none; the participant could not identify the intended first move |
| Question asked | “It tells me a lot about how it’s clear, but I have no idea what to do.” |
| Blocking issue | yes — the primary action was detached in a footer while meta guidance and future steps dominated the screen |
| Product correction | single-task welcome doorway; companion begins at the phone handoff; current-surface language replaces interface philosophy |
| Retest required | yes |

That failure also triggered a full selected-path truth review. The revision now
distinguishes primary and secondary actions, removes duplicate provider and
delivery actions, performs pairing before showing a verified state, and adds a
real Send step before showing provider acceptance. Automated success language
is not treated as proof of Android receipt.

### Owner observation 2 — compressed ntfy task failed

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, revised doorway with original phone checklist |
| Completed without intervention | no |
| Wrong turn | the participant reached “Sign in and protect the topic” but the screen named no ntfy location, control, or finish state |
| Question asked | “This step was not super easy or straightforward.” |
| Blocking issue | yes — five provider tasks were compressed into one checklist and abstract security language replaced instructions |
| Product correction | four phone-setup screens with exact surface labels, exact control names, a public-safe screen preview, one primary action, and a visible “You’re done when” condition |
| Retest required | yes |

The ntfy labels in that correction were verified on 2026-08-15 against the
official [web-app subscription documentation](https://docs.ntfy.sh/subscribe/web/),
[Android subscription documentation](https://docs.ntfy.sh/subscribe/phone/),
and the public ntfy web and Android source. The prototype uses only fictional
topic and account values.

### Owner observation 3 — previous-step navigation was too quiet

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, four-screen phone setup |
| Completed without intervention | no |
| Wrong turn | none; returning to the immediately previous task was not obvious |
| Question asked | “We need an easy, visible way to go back a step in the workflow.” |
| Blocking issue | yes — phone screens used a small footer link and the remaining workflow screens had no consistent previous-step control |
| Product correction | one persistent, labelled Back control before the task heading on every workflow screen after Start; phone substeps return to the preceding phone task rather than skipping the whole Phone step |
| Retest required | yes |

### Owner observation 4 — font glyphs are not an icon system

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, welcome and Android recovery screens |
| Completed without intervention | yes |
| Wrong turn | none; the visual cue was visibly broken and reduced trust |
| Question asked | “There’s something weird with these icons.” |
| Blocking issue | no — but placeholder Unicode symbols rendered inconsistently, including a missing phone glyph in prominent surfaces |
| Product correction | one scoped, Material-style inline SVG vocabulary for semantic facts, recovery states, security, status, and completion; no icon font or network dependency |
| Retest required | yes |

### Owner observation 5 — a fixture looked like live setup data

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, Reserve topic |
| Completed without intervention | no |
| Wrong turn | the participant reasonably interpreted the public `pulse_demo_…` fixture as the topic they were expected to reserve |
| Question asked | “Why are we giving a demo topic to paste?” |
| Blocking issue | yes — public-safe fixture data was presented with a working Copy action and production instructions |
| Product correction | mask the prototype topic, disable Copy, and label the surface as a non-live preview; production still generates and copies a unique topic automatically |
| Retest required | yes |

### Owner observation 6 — wrapped actions lost their control rhythm

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, Runner token and cloud-runner actions |
| Completed without intervention | yes |
| Wrong turn | none; long primary labels wrapped with paragraph spacing inside button-shaped containers |
| Question asked | “The spacing is weird on these buttons with 2 lines of text.” |
| Blocking issue | no — the actions remained usable, but the shared control primitive visibly broke at wrapped labels |
| Product correction | shared buttons now define vertical padding, compact line-height, centered wrapping, and balanced text; large and small variants retain proportional padding |
| Retest required | yes |

### Owner observation 7 — clickable card inherited document-link styling

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, cloud-runner choice |
| Completed without intervention | yes |
| Wrong turn | none; the entire advanced-runner title, description, and metadata appeared underlined |
| Question asked | “All the underline here makes this hard to read.” |
| Blocking issue | no — but link decoration erased the card's title, explanation, and action hierarchy |
| Product correction | remove inherited link decoration from clickable cards, preserve the card-level focus target, and expose one concise accent-colored “Advanced setup →” affordance |
| Retest required | yes |

### Owner observation 8 — contextual badge crowded its heading

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, Netlify browser handoff |
| Completed without intervention | yes |
| Wrong turn | none; the provider-account badge visually collided with the deployment heading |
| Question asked | “This yellow stuff is too close to the header.” |
| Blocking issue | no — hierarchy remained legible, but the context label and heading did not read as separate elements |
| Product correction | shared badge-to-heading spacing now provides explicit block rhythm and a 20px separation for both card-title and subheading variants |
| Retest required | yes |

### Owner observation 9 — status chip wrapped into a giant lozenge

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, runner pairing |
| Completed without intervention | yes |
| Wrong turn | none; “Not connected yet” wrapped into three lines inside an oversized pill |
| Question asked | “This looks bad.” |
| Blocking issue | no — the status remained understandable, but the component visibly failed under constrained width |
| Product correction | use concise `Pending` language, keep status chips on one line, and allow the notice header to move the complete chip when space is constrained |
| Retest required | yes |

### Owner observation 10 — fact-copy selector broke numbered markers

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, runner pairing checks |
| Completed without intervention | yes |
| Wrong turn | none; each numeral sat in the upper-left of an oversized rounded square |
| Question asked | “These numbers look bad.” |
| Blocking issue | no — sequence remained understandable, but the marker alignment and color were visibly broken |
| Product correction | scope fact-copy styles to the copy column only and give numeric sequences centered circular markers with tabular numerals |
| Retest required | yes |

### Owner observation 11 — delivery badges still crowded their headings

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, secure delivery handoff |
| Completed without intervention | yes |
| Wrong turn | none; both the green connection state and yellow runner-context badge sat too close to the heading beneath them |
| Question asked | “The yellow and green here are too tight on the text.” |
| Blocking issue | no — meaning remained intact, but the hierarchy visually fused status/context with the object or action heading |
| Product correction | make compact badges explicit fit-content blocks and use a shared 20px badge-to-heading interval across cards and browser handoffs |
| Retest required | yes |

### Owner observation 12 — browser handoff action looked like a content box

| Field | Record |
| --- | --- |
| Participant | `owner` |
| Direction | C, secure delivery handoff |
| Completed without intervention | yes |
| Wrong turn | none; the long browser-action label wrapped inside a wide outlined rectangle that looked like another card |
| Question asked | “This box is bad.” |
| Blocking issue | no — the action remained usable, but its label and footprint obscured the interface hierarchy |
| Product correction | name the destination directly as `Open runner setup`, and constrain the secondary handoff action to its intrinsic width |
| Retest required | yes |

### Owner observation 13 — repeated number-marker treatment remained in phone instructions

| Field | Record |
| --- | --- |
| Participant | `owner follow-up audit` |
| Direction | C, all four phone-setup instruction screens |
| Completed without intervention | yes |
| Wrong turn | none; the instruction counters still used the same rounded-square treatment previously rejected elsewhere |
| Question asked | comprehensive pass for unreported iterations of the same problems |
| Blocking issue | no — the order stayed understandable, but the visual language remained inconsistent |
| Product correction | use the same centered circular, tabular-number treatment for every sequential instruction marker |
| Retest required | covered by shared CSS, mounted DOM, real-browser, desktop, and narrow render checks |

### Owner observation 14 — completed-state checks still depended on a font glyph

| Field | Record |
| --- | --- |
| Participant | `owner follow-up audit` |
| Direction | all setup directions and the selected flow |
| Completed without intervention | yes |
| Wrong turn | none; completed progress steps and Advanced requirements still used a Unicode check mark that could render as a missing-glyph box |
| Question asked | comprehensive pass for unreported iterations of the same problems |
| Blocking issue | latent — current Chrome rendered the mark, but the implementation repeated the font-dependent icon failure already observed elsewhere |
| Product correction | use the shared inline SVG check for DOM progress markers and a font-independent CSS-drawn check for requirement lists |
| Retest required | covered by source assertions, mounted DOM assertions, real-browser checks, and regenerated visual evidence |

### Owner observation 15 — the Readiness Board crushed runner choices

| Field | Record |
| --- | --- |
| Participant | `owner follow-up audit` |
| Direction | B, runner selection |
| Completed without intervention | yes |
| Wrong turn | none; nested panel padding and a three-column choice layout reduced the label to a word ladder and overflowed its stack |
| Question asked | comprehensive pass for unreported iterations of the same problems |
| Blocking issue | no for the selected direction, but yes for keeping the comparison prototype honestly usable |
| Product correction | remove duplicate board-panel padding and let choice metadata sit beneath the label in a two-column container-specific layout |
| Retest required | covered by source assertions, regenerated desktop evidence, and the all-route browser overflow audit |

## Nine-reviewer council preflight

Before spending unfamiliar-human review time, nine isolated agent reviewers
walked the selected onboarding as everyday users, moderately technical
nondevelopers, and developers, with methodical, impatient-scanning, and
recovery-first behaviors. They received only the public task and interface;
they could not use this document as instructions.

The council reproduced no P0 issue, but it found that several controls were
less truthful than the surrounding design: unsafe origins could appear
verified, the existing-Pulse branch had no pairing-code input, resend returned
to Phone, recovery progress regressed, many differently labelled recovery
actions shared one destination, resume was only copy, external feedback went
stale, and the restart dialog leaked focus. All reproduced P1 and P2 clusters
accepted by the product review were repaired with failing interaction tests
first, then rechecked in mounted DOM and isolated Chrome.

The complete count, decisions, proof map, limits, and raw reports live in the
[`usability-council synthesis`](usability-council/synthesis.md). The council
reduces the burden on human participants; it does not satisfy the unfamiliar-
human G1 gate.

## Evidence inventory

`design/onboarding-evidence/` contains:

- comparison renders at desktop and narrow widths;
- every happy-path step for all three directions at the primary desktop
  viewport;
- every security, provider, resume, failure, migration, existing-installation,
  and Advanced recovery state at desktop and narrow widths;
- narrow renders for the content-heavy phone, runner, delivery, test, and
  Advanced states; and
- a 200% zoom stress render.
- clean selected-route desktop and narrow renders for every setup step,
  including the experienced compatible-runner path and every phone-setup
  substep.

The screenshots prove layout and content coverage. JSDOM and axe assertions
prove structure and scripted behavior. The real-browser audit now covers all
three directions, every selected-flow step, and every recovery state at both
desktop and narrow widths; it also checks the shared visual contracts for
badges, heading gaps, vector icons, circular number markers, compact controls,
and choice-card link decoration. Automation still does not substitute for the
human walkthrough.

## G1 exit gate

Current gate status:

- complete: product-owner direction selection;
- complete: selected guided and experienced paths;
- complete: nine-reviewer agent council and accepted defect repairs;
- complete: automated behavior, real-browser accessibility, narrow, zoom,
  privacy, recovery, and overflow proof;
- pending: Lindsay's unmoderated owner walkthrough; and
- pending: two unfamiliar nondeveloper walkthroughs and any fresh-participant
  retest required by their findings.

G1 is complete only after:

1. the product owner selects a direction using the rubric;
2. the selected direction is revised into the complete prototype;
3. Lindsay and two unfamiliar nondevelopers run the task script;
4. every blocker is fixed and retested with a fresh participant;
5. keyboard-only, screen-reader landmark, reduced-motion, narrow-width, and
   200% text-zoom reviews pass; and
6. product/function and visual/interaction reviews are repeated after fixes.

Production setup code does not begin while this gate has an unresolved
placeholder, a failed critical state, or a participant who needed coaching.
