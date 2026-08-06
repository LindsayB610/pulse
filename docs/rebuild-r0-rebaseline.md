# Pulse Rebuild R0 — Rebaseline

Date: 2026-07-21

Status: **accepted.**

> Historical snapshot: this records the state at R0 acceptance. The R1–R7
> batch later replaced `pulse-ui` with the API-only `pulse-api` command and
> native Workshop proxy; current status and acceptance evidence live in
> [project-plan.md](../project-plan.md).

R0 is a review and planning phase. It does not accept, publish, deploy, or
otherwise treat the exploratory implementation as approved work.

## Confirmed product boundary

- **Superseded:** Workshop as the only Pulse management UI. Pulse now owns its
  independently versioned plugin UI.
- Pulse owns recurring schedules, durable occurrence state, repeat behavior,
  and notification delivery.
- ntfy is the proposed first Android notification provider.
- Twilio/SMS is retired from the active product direction.
- Real pulses, ntfy topics/tokens, runner API credentials, and state remain
  outside the public repositories.
- A due occurrence remains active until Done. Android notifications also offer
  a fixed 30-minute Snooze action; dismiss and skip are not available.

## Change inventory

The working trees contain several categories of changes. Only the exploratory
items below are in scope for this rebuild; the unrelated items are preserved
without review or modification by this phase.

| Category | Locations | Ownership / scope | R0 disposition |
| --- | --- | --- | --- |
| Pre-existing/private-boundary change | `pulse/.gitignore` | Present before the rebuild pass; ignores an in-repository `private/` folder. | **Reviewed in R1.** This setup uses the sibling `workshop-private/pulse/` root and does not depend on an ignore rule. |
| Exploratory ntfy migration | `pulse/src/adapters.ts`, `src/index.ts`, `src/storage.ts`, `.env.example`, Pulse docs, and Phase 0/3/5/6/9 tests | Replaces Twilio-first names and behavior with ntfy-first names and mocked payload tests. | **Map to R1–R2.** Do not accept until configuration, payload, retry, privacy, and Android setup decisions are reviewed. |
| Exploratory runner API | `pulse/src/ui.ts`, `bin/pulse-ui.mjs`, Compose, API-related docs, and Phase 7 tests | Adds authenticated snapshot/Done endpoints and a second Compose process. The endpoint currently shares the former local UI server. | **Map to R3.** Revise before acceptance: server naming, API-only versus legacy HTML behavior, authorization failure headers, CORS policy, network exposure, and deployment topology are undecided. |
| Exploratory Workshop UI | Historical `workshop/.../tools/pulse/` work | Replaced by the Pulse-owned external plugin package. | **Superseded.** Do not extend or treat as Pulse architecture. |
| Unrelated Workshop/Slate work | `workshop/.../src-tauri/*` and all changed/untracked `tools/slate/*` files | Separate ongoing Slate implementation, including Rust/Cargo changes. | **Out of scope.** Preserve unchanged; it is not Pulse rebuild evidence. |

## Recommended disposition by rebuild phase

### R1 — Private delivery contract

Review and decide before retaining the ntfy configuration changes:

- What makes an ntfy topic sufficiently private: random topic alone, access
  token, private server, or a required combination?
- Whether `PULSE_NTFY_SERVER` may use public ntfy, a self-hosted server, or
  both.
- Whether `PULSE_API_TOKEN` is a separate secret and where it is generated,
  stored, and rotated.
- Whether the added ignore entries are the correct public-repository policy.

### R2 — ntfy provider

Review the exploratory adapter, but do not accept it yet. The phase must define
the exact ntfy request contract, priority/tag policy, notification body, retry
semantics, and whether a notification action is required. The current adapter
is an implementation candidate, not the approved contract.

### R3 — Private runner API

The current snapshot/Done API is a useful prototype but is not accepted. R3
must decide whether it is a separate API process, how Workshop reaches it, how
the server is authenticated and network-isolated, and whether the legacy
standalone HTML management surface is removed at this stage or R6.

### R4–R5 — Workshop connection and experience

The current direct `fetch` UI is a prototype only. R4 must select secure token
handling and a desktop networking approach before R5 builds the live views.
The current direct browser CORS approach should not become the accepted
architecture without that review.

### R6–R8 — Not started

No R6 retirement, R7 end-to-end cloud/Android proof, or R8 release/operations
acceptance work has been performed. Existing deployment documentation is not
evidence that the new architecture is deployed or proven.

## R0 outcome

The owner accepted this inventory and selected R1. No exploratory
implementation was accepted, committed, deployed, or released by R0 itself.

## R0 verification

- Reviewed the Pulse and Workshop working-tree status and scoped diffs.
- Confirmed the changed Workshop Rust/Cargo code is Slate-specific, not Pulse
  integration work.
- Ran `git diff --check` in both repositories; no whitespace errors were
  reported.
- Replaced the hard-coded documentation file list with recursive Markdown
  discovery and added a regression test for newly added nested documentation.
- Ran Pulse documentation and formatting checks successfully; the checker now
  includes this R0 record.
