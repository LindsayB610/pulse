# Pulse onboarding usability council

This council is a pre-human-review stress test of the guided onboarding
prototype. It does not replace unfamiliar-human usability testing.

## Frozen review target

- Prototype: `design/onboarding-prototype/index.html`
- Entry route: `#/selected/welcome`
- Baseline commit: `ab3cc232727857c1cf7c4e37eba850ad7b0617a7`
- Working-tree state: the complete uncommitted guided-setup prototype at the
  start of the council run

The prototype remains unchanged until all nine reviews finish.

## Council matrix

| Technical persona | Methodical | Impatient scanner | Cautious recovery |
| --- | --- | --- | --- |
| Everyday user | EU-M | EU-S | EU-R |
| Moderately technical nondeveloper | MT-M | MT-S | MT-R |
| Developer | DV-M | DV-S | DV-R |

## Reviewer rules

Each reviewer receives only the target, persona, behavior, and task. Reviewers
must not read previous reports, edit files, use real credentials, deploy a real
runner, or treat design documentation and tests as onboarding instructions.
They must begin with the rendered interface, interact with the fake workflow,
and inspect source only afterward when necessary to confirm a suspected broken
control.

Every finding must include:

- persona and behavior;
- exact route or screen;
- intended task;
- expected cue or result;
- observed cue or result;
- exact copy or control involved;
- whether recovery was possible without outside help;
- severity;
- classification; and
- reproducible evidence.

Reviewers distinguish functional defects, unclear instructions, interaction
ambiguity, visual defects, accessibility defects, and personal preferences.
Suggestions are welcome, but reviewers do not make implementation decisions.

## Synthesis rules

The primary agent reproduces every actionable finding and keeps raw reports
separate from the decision record. Findings are grouped only when they describe
the same underlying problem. Consensus is reported only when at least two
reviewers independently surface it.

- P0: security, privacy, data-loss, or dangerous setup behavior
- P1: broken action or inability to complete onboarding
- P2: repeated confusion, misleading language, wrong turns, or poor recovery
- P3: isolated polish or preference

All verified P0 and P1 findings are fixed. P2 findings are fixed when the
change improves the product without adding compensating confusion. P3 findings
are accepted only when they reinforce the established design system. A
single-reviewer defect may still be fixed when it reproduces.

Accepted behavioral changes receive a failing regression test first. Accepted
visual changes receive a focused contract test, mounted/rendered proof, and a
real-browser check at the primary and narrow viewports. After implementation,
the complete product, visual, accessibility, integration, privacy, clean-install,
and coverage gates run again.
