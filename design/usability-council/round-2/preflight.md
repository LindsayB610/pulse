# Round-two preflight

The second council begins only after a root-agent audit of behavior, design,
documentation, and coverage. The frozen artifact hash is appended below before
the first reviewer starts.

## Repaired before the freeze

- Runner verification now requires a public, origin-only HTTPS address and
  rejects local, private, credentialed, path-bearing, single-label, and CGNAT
  destinations.
- Runner and existing-installation addresses survive Back/return navigation;
  one-time pairing codes never enter browser storage.
- Initial delivery tests have a real pending state. Late asynchronous results
  cannot hijack a user who navigated elsewhere.
- Missing-notification resend has a visible 30-second cooldown that expires
  without a page reload.
- Browser resume state accepts only explicit setup routes rather than arbitrary
  `state/*` fragments.
- Cancelling a provider handoff now returns a truthful, visible result instead
  of behaving like a mislabeled route link.
- Recovery language uses user-facing terms and no longer claims more state
  preservation than a repair can guarantee.
- The documented prototype server root now keeps completion links resolvable.
- The visual evidence set includes every selected recovery state at desktop and
  narrow widths and uses isolated, time-bounded Chrome profiles.
- The real-browser suite clicks through the complete happy path and the
  consequential validation, retry, modal, keyboard, and narrow-layout paths.

## Proof before the freeze

- Focused onboarding tests: 43 passed
- Real-browser interaction suite: passed at 1440px and 500px
- Exhaustive browser layout/accessibility audit: passed in 290 seconds
- Full suite: 178 core tests plus the Netlify integration test passed
- Main coverage: 97.04% lines, 84.65% branches, 95.11% functions
- Netlify slice: 80.03% lines, 67.18% branches, 83.09% functions
- Format: 109 files checked
- Documentation: 33 Markdown files checked
- Public/privacy boundary: 38 files checked
- Root and Netlify typechecks: passed
- Plugin build and clean Git-consumer install: passed

## Frozen artifact

- Baseline commit: `ab3cc232727857c1cf7c4e37eba850ad7b0617a7`
- Content hash: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Post-council result

All nine reviewers completed the frozen review before implementation resumed.
The primary agent reproduced, normalized, and resolved every accepted finding.
The final decisions and regression evidence are recorded in
[`synthesis.md`](synthesis.md). The original hash remains the immutable review
target; regenerated evidence represents the repaired post-council build.
