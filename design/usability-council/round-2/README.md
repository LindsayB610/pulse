# Pulse onboarding usability council — round 2

This is a fresh nine-reviewer stress test of the repaired guided onboarding
prototype. It repeats the original council matrix without exposing the first
round's reports or synthesis to reviewers. It still does not replace testing
with unfamiliar humans against real provider handoffs.

## Frozen review target

- Prototype: `design/onboarding-prototype/index.html`
- Entry route: `#/selected/welcome`
- Baseline commit: `ab3cc232727857c1cf7c4e37eba850ad7b0617a7`
- Content hash: recorded in `preflight.md` immediately before reviewer one
- Working-tree state: the complete uncommitted guided-setup implementation
  after the round-two preflight repairs

The prototype, its styles, and its behavior remain unchanged until all nine
reviews finish.

## Council matrix

| Technical persona | Methodical | Impatient scanner | Cautious recovery |
| --- | --- | --- | --- |
| Everyday user | EU2-M | EU2-S | EU2-R |
| Moderately technical nondeveloper | MT2-M | MT2-S | MT2-R |
| Developer | DV2-M | DV2-S | DV2-R |

## Reviewer rules

Each reviewer receives only the frozen target, persona, behavior, and task.
Reviewers must not read either council's reports or synthesis, edit files, use
real credentials, deploy a real runner, or treat documentation and tests as
onboarding instructions. They begin with the rendered interface, interact with
the fictional workflow, and inspect source only afterward when needed to
confirm a suspected defect.

Every finding must include the persona and behavior, exact route or screen,
task, expected and observed result, exact copy or control, recovery path,
severity, classification, and reproducible evidence. Reviewers distinguish
functional defects, unclear instructions, interaction ambiguity, visual or
accessibility defects, and personal preference.

## Synthesis and implementation rules

Reviews run sequentially against the same frozen build. The primary agent
reproduces every actionable finding, groups only the same underlying problem,
and reports consensus only when at least two reviewers independently surfaced
it.

- P0: security, privacy, data loss, or dangerous setup behavior
- P1: broken action or inability to complete onboarding
- P2: repeated confusion, misleading language, wrong turns, or poor recovery
- P3: isolated polish or preference

All verified P0 and P1 findings are fixed. P2 findings are fixed when the
change improves the product without creating compensating confusion. P3
findings are accepted only when they reinforce the established design system.
A single-reviewer defect can still be fixed when it reproduces.

Accepted behavior changes receive a failing regression test first. Accepted
visual changes receive a focused contract test, rendered evidence, and a real-
browser check at desktop and narrow widths. The complete product, visual,
accessibility, integration, privacy, clean-install, and coverage gates run
again after implementation.
