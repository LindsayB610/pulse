# DV2-M raw council report

Persona: experienced web/product developer; methodical, contract- and test-
focused.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Local runner-origin variants bypass validation

Accepted and advanced to Delivery:

- `https://[::]`
- `https://[::ffff:127.0.0.1]`
- `https://[::ffff:10.0.0.1]`
- `https://[::ffff:169.254.169.254]`
- `https://localhost.`
- `https://device.local.`

Expected: reject as local/private origins. Recovery requires Back, but the
unsafe value is persisted as verified. Classification: security-contract and
product-truth defect. The prototype makes no request, but reuse in a live path
would be dangerous. Current validation handles only a narrow IPv6 subset and
compares unnormalized trailing-dot hostnames.

### P2 — Unknown recovery URLs fabricate and persist progress

- Clean `state/not-real` renders Resume, then Welcome says Continue at Connect
  and 4 of 7.
- Unknown state aliases to Resume and rendered recovery progress is persisted.
- Classification: state-integrity/truthful-recovery defect.

### P2 — Advanced compatibility actions 404

- The documented `--directory design` server cannot serve sibling `docs/`.
- “Open update instructions” and “Open the runner compatibility contract” both
  resolve to 404.
- Classification: functional/documentation defect.

### P2 — Restart confirmation leaks into the next task

- After reset, the result appears on Welcome and again above the first Phone
  task.
- It is cleared only after rendering that later step.
- Classification: truthful-state and interaction-polish defect.

### P2 — Future cooldown timestamps can lock or spin recovery

- Any positive finite `lastTestSentAt` is accepted.
- A future/extreme value can disable resend for a long period, overflow the
  timer, or create a rapid rerender loop after clock rollback/corrupt state.
- Classification: corrupted-state resilience defect.

### P3 — One narrow evidence image appears stale/cropped

- `selected-state-advanced-narrow.jpg` looked clipped despite the live browser
  audit passing. Requires regeneration/inspection.

### P3 — Literal native keyboard behavior is not fully proven

- Tests dispatch submit and keyboard events rather than actual Enter/Tab input.
- No confirmed defect; add real keyboard automation and promote only if it
  reproduces in normal Chrome.

## Strengths

- Happy path and cross-device handoffs work honestly.
- Async send and navigation guards work.
- Recovery cooldown persists and expires on the tested route.
- Existing address persists while pairing code does not.
- Validation errors focus and clear appropriately.
- Provider cancellation and recovery consequences are truthful.
- Restart focus containment exists.
- Mac-first and narrow design, icons, spacing, contrast, and focus styling are
  strong.
- Exhaustive route audit found no overflow or axe violations.

No P0 findings. No files were edited.
