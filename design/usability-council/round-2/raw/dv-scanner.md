# DV2-S raw council report

Persona: experienced developer/product engineer; fast scanner, shortcut-heavy,
and hostile-input/state focused.

Frozen artifact: `9f03c114f7b531bbf4297516828fe8a3780e90d4d189f7947f07405930309cba`

## Findings

### P1 — Unsafe URL contents are persisted before validation

- Routes: `pairing` and `existing`.
- Typing `https://alice:super-secret@pulse.example` without submitting, then
  reloading restores the entire credential-bearing URL.
- Raw input is written immediately to localStorage and any string up to 2048
  characters is accepted during state load.
- Recovery requires replacement or reset; no cue says unsafe input persisted.
- Classification: security/privacy-boundary defect.
- Test gap: an existing validation test codifies query-token persistence across
  navigation rather than ensuring unsafe material is excluded.

### P1 — Public-origin validation accepts local/private aliases

Accepted examples:

- IPv4-mapped IPv6 for loopback, private, link-local, and CGNAT ranges
- `foo.localhost`, `localhost.`, and `foo.localhost.`
- `metadata.google.internal`

These advance to Delivery despite the public-origin contract. Recovery is Back
and correction. Classification: security/functional contract defect.

### P2 — Prototype-chain route names render an undefined screen

- Live hashes using `__proto__`, `constructor`, `toString`, `valueOf`, or
  `hasOwnProperty` as state names render undefined headings/actions and corrupt
  Back links.
- Direction variants can also leak undefined metadata.
- Cause: lookup tests ordinary-object truthiness rather than own-property
  membership.
- Recovery requires manual navigation to Welcome.
- Classification: routing/state robustness defect.

## Strengths

- Happy, existing-runner, and advanced paths are coherent.
- Async send and late-navigation guards work.
- Retry works on the tested recovery route.
- Pairing codes remain nonpersistent.
- Provider cancellation and external simulations are truthful.
- Restart modal keyboard behavior works.
- 500px layout has no page overflow.
- Visual hierarchy, previews, completion criteria, surface labels, and recovery
  framing remain strong.

## Required coverage gaps

- Unsafe raw URL input must not persist: userinfo, query token, fragment, path.
- Add mapped-IPv6 and reserved local-domain cases.
- Fuzz live state and direction hashes with inherited object keys.
- Retain pairing-code, async, cooldown, modal, happy-path, and compact-layout
  coverage.

No P0 findings. No files were edited.
