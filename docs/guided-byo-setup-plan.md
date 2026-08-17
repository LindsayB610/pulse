# Pulse Guided BYO Setup

## Product Scope, Experience Design, and TDD Workplan

**Status:** G0–G7 are implemented locally. The selected Companion Split View
has completed the owner walkthrough plus two nine-reviewer agent councils; all
reproduced findings were repaired and covered. G8 automation is green. A
disposable production deployment, Android proof, and two unfamiliar-human
production walkthroughs remain the release gates.

**Feature owner:** Pulse owns the setup experience, cloud bootstrap, setup
state, copy, and recovery UI. Workshop remains the desktop host and supplies
only generic native security capabilities.

**Cost rule:** Pulse never operates or subsidizes another person's reminder
infrastructure. Every user supplies and owns any account, quota, subscription,
domain, or hosting that can incur cost.

## Executive decision

Pulse will replace its developer-oriented first run with a guided
bring-your-own-service setup. Pulse depends on notification and runner
capabilities, not permanent provider brands. ntfy is the first supported
Android notification adapter, and Netlify is the first supported quick-setup
runner adapter. Advanced users may connect any compatible runner that
implements Pulse's public manifest, persistence, scheduling, HTTPS, secret, and
pairing contracts.

The normal path must not require a terminal, hand-written JSON, environment
variable knowledge, a pasted filesystem path, or direct Keychain work. A
supported quick-setup adapter may hand the user to its notification or hosting
provider for account-owned actions, but each handoff must have one job,
plain-language instructions, visible progress, and a tested return path.

This is not a hosted Pulse service. Pulse supplies software and setup guidance;
the user owns the services and their bills.

## Why this feature exists

The current disconnected screen asks for a "Private Pulse folder." That folder
only works after someone has already:

1. created and configured a Netlify deployment;
2. created an ntfy account, private topic, and access token;
3. generated several unrelated secrets;
4. entered runtime environment variables;
5. written `pulse.config.json` by hand;
6. placed a matching runner credential in the macOS Keychain; and
7. understood which data lives locally, remotely, or in the public repository.

The screen is therefore a connection form for an already-provisioned system,
not a setup experience. The finished product should make the secure
architecture invisible during normal setup without weakening it.

## Product contract

### User and job

The primary user is a person running Pulse inside Workshop on a Mac laptop who
wants reminders delivered to an Android phone even while the Mac is asleep.
They can sign into their own provider accounts and follow a short guided
handoff. They are not expected to understand deployment, environment variables,
JSON, bearer tokens, Keychain records, or repository boundaries.

Their job is:

> Connect my phone and my own always-on runner, prove that a notification
> reaches me, and create my first reminder without becoming the operator of a
> software project.

### Primary and secondary environments

- **Primary setup surface:** Pulse embedded in Workshop on macOS, using a
  roughly 1280–1440px-wide laptop window, keyboard, and pointer.
- **Account handoffs:** The user's browser, authenticated to the selected
  notification and runner providers. The first supported quick path uses ntfy
  and Netlify.
- **Delivery proof:** The user's Android phone running the ntfy app.
- **Secondary setup surface:** A narrow Workshop window. This is a resilience
  and accessibility requirement, not the organizing metaphor.
- **Advanced surface:** Provider dashboards and manual documentation for
  self-hosting, migration, or last-resort recovery.

### Ownership boundary

| Concern | Owner | Rule |
| --- | --- | --- |
| Setup screens, progress, errors, and recovery | Pulse plugin | Remains inside the Pulse package and inherits Workshop's active appearance tokens with standalone fallbacks. |
| Reminder definitions, state, history, runner health | User's Pulse runner | The compatible runner's private persistent store is authoritative. The first Netlify adapter uses Netlify Blobs. |
| Android delivery account, topic, token, and subscription | User and ntfy | Pulse never shares Lindsay's account, topic, quota, or subscription. |
| Cloud account, site, quota, and billing | User and selected runner provider | Pulse never creates a deployment in an account owned by Lindsay. |
| Local service metadata and durable API credential | Workshop native host | The durable credential never enters the Pulse webview. |
| Generic secure provisioning primitives | Workshop | No Pulse-specific screen, command name, provider account, or business logic belongs in Workshop. |
| Public code, examples, deploy template, and docs | Pulse repository | No real reminder, topic, token, endpoint, account identifier, or completion history is committed. |

### Source-of-truth rules

- The selected compatible runner's private persistent store is the production
  source of truth for definitions, occurrences, history, runner heartbeat,
  setup completion, registered client credential hashes, and generated
  server-side signing material. The first Netlify adapter uses Netlify Blobs.
- The selected adapter's approved provider-private store is the source of truth
  for the ntfy access token and other delivery secrets. For the first Netlify
  adapter this is a fixed-key, site-scoped Blobs record, written only after
  native origin-bound pairing through a short-lived runner-owned browser setup
  session. Each quick-setup adapter must verify its actual storage, visibility,
  runtime/build access, deploy-context, encryption, and secret-protection
  behavior before Pulse may describe it as secure.
- The local Pulse service configuration contains only a version, HTTPS endpoint,
  and non-secret Keychain credential reference.
- The macOS Keychain contains the durable per-installation runner credential.
- Workshop's native host owns pending setup records and ephemeral private keys.
  Pulse receives only an opaque setup identifier, public-key material, a
  display-safe fingerprint, and redacted progress.
- The Pulse webview must never receive or retain an ephemeral private key,
  durable runner credential, or ntfy token.
- The public repository contains code, fictional fixtures, and instructions
  only.

### Cost and account rules

- The setup explains before either handoff that Pulse itself does not charge
  for or provide cloud delivery.
- A user signs into their own selected notification and runner-provider
  accounts and accepts those providers' current terms, quotas, and prices.
- Pulse never automatically purchases, upgrades, renews, or changes a paid
  plan.
- The user may select a free or paid provider tier if the provider offers one.
  Pulse does not promise that a particular tier will remain free.
- Self-hosting is an advanced alternative, not a cost absorbed by the Pulse
  maintainer.
- No shared Pulse backend, shared ntfy topic, pooled token, or multi-tenant
  account is introduced.

### Non-goals

This feature does not:

- turn Pulse into a hosted SaaS or billing product;
- add accounts owned or operated by the Pulse maintainer;
- add SMS, email, iOS push, or a provider marketplace;
- automate ntfy subscription inside the Android app;
- change Done, Snooze, no-action, retry, recurrence, or notification-chain
  semantics;
- implement bounded recurrence or new scheduling options;
- redesign Workshop or add Pulse-specific UI to Workshop;
- import Workshop source or add a Workshop package dependency to Pulse;
- hide provider ownership, pricing, permissions, or failure;
- remove the manual and self-hosted path;
- promise a one-click flow where provider security requires a user action.

### Success test

A person starting with Workshop, an Android phone, and no Pulse deployment can:

1. understand what Pulse needs and who owns any cost;
2. prepare ntfy and subscribe the phone;
3. deploy the runner through a supported quick-setup adapter or connect another
   compatible runner in their own account;
4. pair Workshop without handling a durable API token or local config file;
5. receive and confirm a test notification;
6. land on the connected empty state and create a first reminder; and
7. close and reopen Workshop without repeating setup.

The target is under ten minutes excluding provider signup, email verification,
payment entry, and deployment queue time. No step in the recommended path may
require documentation, a terminal, or editing raw configuration.

Provider signup and verification are excluded from the time target, not from
the experience. Pulse still detects and explains when the user must create an
account, verify it, grant provider authorization, enable Android notifications,
or choose a provider tier that supports private authenticated delivery.

## Experience architecture

### Entry state

When Pulse has no valid local service connection, the Reminders route becomes a
first-run surface with two choices:

- **Set up a new Pulse** — the prominent default action.
- **Connect an existing Pulse** — for another Mac, reinstall, or restored
  deployment.

The current folder field moves to **Advanced setup**. A normal user should not
have to know that a local configuration directory exists.

### Recommended setup journey

#### 1. Welcome and ownership

The first screen answers three questions without infrastructure vocabulary:

- **What will happen?** Pulse will notify the Android phone even when this Mac
  is asleep.
- **What is required?** A supported phone-notification account/app and a
  compatible always-on runner. The first quick path uses ntfy and Netlify.
- **Who pays?** The user owns any provider plan or usage; Pulse does not provide
  shared hosting.

Primary action: **Set up Pulse**.

Secondary actions: **Connect an existing Pulse** and **Advanced setup**.

#### 2. Connect phone notifications

Workshop begins a native pending setup session, and Pulse receives a unique,
URL-safe topic suggestion of at least 32 characters from that redacted session.
Phone setup is one top-level setup step with four task screens. It must not
compress provider work into an abstract checklist:

1. **Add the ntfy Android user:** show the exact Settings → Manage users → Add
   users → Add new user route, a public-safe screen preview, and the success
   condition under Users.
2. **Reserve the topic:** show the exact web Settings → Reserved topics → Add
   reserved topic route, the generated topic, the required “Only I can publish
   and subscribe” access value, and the resulting reservation state.
3. **Subscribe on Android:** provide a production-generated `ntfy://` QR/deep
   link plus manual fallback, require Instant delivery, and name
   the expected Subscribed topics and “Instant delivery on” results.
4. **Create runner access:** show Account → Access tokens → Create access token,
   label it “Pulse runner,” explain durable expiry and revocation, and tell the
   user to keep the ntfy tab open for the later runner-owned handoff.

Each screen uses the exact current provider control names, one primary action,
one visible “You’re done when” condition, and a screenshot or faithful
public-safe screen landmark. The sequence uses copy buttons for the topic and
links to the exact official ntfy surfaces. It explains that the ntfy token is
sensitive and will be entered
later on a secure page belonging to the user's verified runner, not into Pulse,
Workshop, or a deployment form.

Every workflow screen after Start also begins with one visibly outlined,
keyboard-focusable **Back to [previous task]** control. Back follows the actual
task sequence—including each phone substep—rather than jumping to the beginning
of a top-level section. The control remains above the task heading at desktop,
narrow, and zoomed layouts; it does not compete with the screen's primary
forward action.

Pulse cannot independently verify the Android subscription. The human
confirmation happens after the test notification, not through a fake connected
badge here.

If account creation, topic protection, token creation, or notification
permission is unavailable, the screen stays on this step and offers the exact
recovery action: finish verification, compare provider plan capabilities, open
Android notification settings, retry, or switch to Advanced self-hosting. It
does not weaken privacy by treating an unprotected random topic as equivalent
to authenticated delivery.

The primary actions advance only one task at a time: **My ntfy user is saved**,
**My topic is reserved**, **Pulse appears in my topics**, and **I created the
runner token**.

#### 3. Deploy or connect the user's cloud runner

Pulse presents two paths:

- **Quick setup with Netlify** — the first supported guided adapter.
- **Connect another compatible runner** — for another provider, an existing
  deployment, or a self-hosted installation that implements the public Pulse
  runner contract.

The provider-neutral product flow owns preparation, origin verification,
pairing, health, testing, and recovery. A deployment adapter owns only the
provider-specific account, authorization, secret-storage, deployment, return,
and deletion handoffs.

##### Netlify quick-setup adapter

Pulse asks Workshop to add an ephemeral asymmetric keypair to the native
pending setup session. Pulse receives only its public key and fingerprint, then
opens an official Netlify template-deployment handoff. The deployment URL may
pre-fill the public key, generated topic, and default server in its client-side
fragment; it never contains the ntfy token or a private key. The deployment
must use the user's account and a copy of the public Pulse repository.
Netlify's supported template environment configuration should present friendly
descriptions for the required values.

The deployment receives only public setup material:

- the ephemeral public key and fingerprint;
- the generated private topic; and
- a non-default ntfy server only if the user deliberately chose one.

If the user does not yet have a Netlify account, must verify it, must authorize
a Git provider, cannot clone the template, or lacks permission in the selected
team, Pulse preserves progress and explains the provider-owned action on
return. A provider denial is not rendered as a broken Pulse runner.

G0 proved that Netlify's template form cannot establish the approved
production-runtime-only boundary before the first build, so template-time ntfy
token entry is rejected. After native origin-bound pairing succeeds, Workshop
asks the runner for a short-lived, single-use setup session and opens the
runner-owned setup page directly in the system browser without returning its
capability to Pulse. The user enters the ntfy token there. The page exchanges
the fragment-delivered capability for an HttpOnly, SameSite=Strict session,
writes the token to a fixed-key, site-scoped encrypted Blobs record, never
echoes it, and returns only delivery-ready status.

The deployment derives its own public site origin from the trusted Netlify
runtime rather than asking the user to construct `PULSE_PUBLIC_BASE_URL`.
Server-side notification signing material is generated during bootstrap and
stored privately; the user does not create it.

Pulse must not claim deployment success merely because the browser opened.
After the user returns, Pulse asks for or receives the deployed HTTPS site URL,
then asks Workshop to validate the service identity, API version, setup state,
runner health, and deployed public-key fingerprint.

Preferred return: a verified deep-link or callback from the deployment success
page. This return improves convenience but is not accepted as proof of
ownership by itself. Required fallback: a clearly labeled **Paste your Pulse
site address** field with example shape and normalization. The implementation
spike must prove which return mechanism Netlify currently supports before the
prototype commits to it.

Both return paths use the same origin-bound proof: the runner must present the
public-key fingerprint injected into that user's deployment, and Workshop must
complete a challenge signed by the matching native private key. A merely
compatible Pulse manifest or user-pasted URL is insufficient. A wrong or
malicious origin never receives a reusable setup secret or durable credential.

Primary action: **Deploy with Netlify**, followed by **Connect this runner**.

##### Other compatible runner

Pulse asks for the runner's HTTPS address, then uses the same public manifest,
fingerprint, origin-bound pairing, health, and test-notification contracts. A
provider with its own supported adapter may supply a guided deployment handoff;
otherwise the runner is treated as Advanced setup and must already be deployed
and configured by its owner.

Pulse does not present an arbitrary host as equally easy merely because its API
is compatible. **Quick setup** is reserved for adapters that pass the same
security, usability, accessibility, clean-deploy, recovery, and deletion gates
as Netlify.

#### 4. Secure pairing

The Pulse plugin asks Workshop's generic native provisioning capability to
pair with the candidate HTTPS origin. The native host:

1. retrieves the pending ephemeral private key without returning it;
2. fetches the runner's fixed manifest and challenge from the candidate origin;
3. requires the deployed public-key fingerprint to match the pending setup;
4. signs a payload containing the normalized HTTPS origin, challenge,
   installation identifier, and API version;
5. submits the proof to the same pinned origin without following redirects;
6. receives the new durable client credential internally;
7. stores that credential in the macOS Keychain;
8. creates a managed private service directory outside every repository;
9. writes `pulse.config.json` atomically with endpoint and credential reference
   only; and
10. removes the ephemeral private key and returns non-secret metadata and
    connection status to Pulse.

If any local step fails, the native host revokes or discards the issued client
credential and rolls back partial local state. The user sees a recoverable
plain-language error, not a half-connected installation.

#### 5. Finish delivery configuration

Pulse asks Workshop's generic native service to request a short-lived,
single-use notification-setup handoff from the paired runner and open it at the
same pinned HTTPS origin. Pulse receives only redacted opened/ready/expired
status. The runner-owned browser page has one job: accept the ntfy token created
earlier and store it in the adapter-approved provider-private store.

For the first Netlify adapter, the store is site-scoped Netlify Blobs. The
endpoint uses a fixed internal key, accepts no caller-selected store/key,
operates only in the production context, never returns the token, and clears
the setup session after a successful write. The token is absent from the
deployment URL/form, repository, build, artifacts, logs, Pulse, Workshop, and
local configuration.

#### 6. Prove delivery

Pulse calls an authenticated test-notification endpoint through Workshop's
existing constrained requester. The test notification is visually distinct
from a real obligation, contains no private fixture, creates no recurring
occurrence, and can be cleaned up without deleting unrelated ntfy messages.

The screen waits for the user to choose:

- **I got it** — setup succeeds;
- **Send it again** — one deliberate retry with rate limiting;
- **It did not arrive** — opens a diagnostic checklist for ntfy subscription,
  Android notification permission, topic match, runner health, and provider
  response.

Setup completion is based on the user's confirmation plus a successful server
delivery response. Pulse must not pretend it can observe Android receipt.

#### 7. Finish

The completion screen states:

- phone notifications are ready;
- the user's cloud runner is online;
- local access is protected by Workshop; and
- the user owns the connected provider accounts.

Primary action: **Create your first reminder**.

The action lands in the existing Pulse-owned creation flow. Setup does not
create a real or test reminder automatically.

### Returning and recovery journeys

#### Existing healthy installation

Pulse restores its managed local root and validates the service silently. It
lands on Reminders without flashing the setup wizard. A slow health request may
show the existing loading state, but it must not imply disconnection.

#### Connect another Mac

An authenticated installation can create a short-lived, single-use pairing
code from Settings. The new Mac uses **Connect an existing Pulse**, supplies the
endpoint and pairing code, and receives its own revocable client credential.
Credentials are never copied between Macs.

Additional-device codes expire after ten minutes, are bound to the known
runner origin and new installation identifier, and remain a recovery mechanism
rather than the first-run deployment proof. Expiry and replay never affect the
already-connected installation.

#### Replace or reconnect the phone

Settings offers **Test phone notifications** and **Set up another phone**. The
latter repeats the ntfy subscription guidance without redeploying or rotating
the runner credential.

#### ntfy token revoked or expired

Pulse reports that the runner is online but notification delivery is rejected.
Recovery asks the selected deployment adapter for a new short-lived,
single-use runner-owned setup page and explains that a replacement ntfy token
must be stored there. Pulse never asks the user to paste the ntfy token into
the plugin, a deployment template, or a generic provider settings form.

#### Runner deployment unavailable or deleted

Pulse distinguishes an unreachable deployment from invalid local credentials.
It offers **Retry**, **Open hosting provider** when the adapter supports it, and
**Connect a different runner**. It does not delete local connection metadata or
reminders automatically.

#### Lost local credential with surviving deployment

If another connected installation exists, create a new pairing code there. If
all connected installations are lost, the advanced recovery guide uses the
user's runner-provider ownership to reset pairing deliberately. This rare path
may be technical; it must be safe, explicit, and documented.

#### Manual or self-hosted connection

Advanced setup retains the current absolute-root/config contract and explains
the exact security requirements. It does not dilute the normal journey with
developer fields.

### Pending setup and resume contract

Workshop, not Pulse local storage, owns a versioned pending setup record. A
redacted view lets Pulse render and resume the correct step after Workshop
restart, app update, browser handoff, or temporary network loss.

The native pending record contains:

- opaque setup and installation identifiers;
- current step and completed provider acknowledgements;
- generated private topic, selected ntfy server, and deployed site URL when
  known;
- ephemeral public key, display fingerprint, and native Keychain reference for
  its private key;
- created and last-updated timestamps;
- deployment-known and pairing-complete flags; and
- schema version and migration status.

It never contains the ntfy access token or durable runner credential. The
ephemeral private key remains in the Keychain and is addressed only by
reference.

Pre-deployment sessions may be discarded automatically after seven inactive
days. Once a deployment origin is recorded, Workshop never silently expires or
deletes the matching private key: doing so would strand the user's deployed
site. After 30 inactive days Pulse may label the setup stale and offer Resume,
Restart with this deployment, or provider-owned deletion, but cleanup requires
an explicit choice and explains what remains at the selected runner provider.

On successful pairing, Workshop deletes pending key material only after the
durable credential and config are committed and verified. **Start over** keeps
the same pending key when a deployment already contains its public key unless
the user explicitly chooses to abandon that deployment. Schema migrations are
fail-closed and preserve the previous record until the migrated record is
validated.

## Setup state and interaction matrix

| State or job | User question | Primary action | Secondary action | Truthful status | Recovery |
| --- | --- | --- | --- | --- | --- |
| No setup | How do I begin? | Set up a new Pulse | Connect existing; Advanced | Nothing is connected yet | Restart setup safely |
| Setup resumed | Where was I? | Continue setup | Start over | Saved step and completed handoffs | Confirm before discarding pending setup |
| Phone preparation | What do I do in ntfy? | My phone is ready | Open ntfy help | Phone subscription is not yet verified | Return to instructions |
| ntfy account unverified | Why can I not create a token? | Finish account verification | Retry; Advanced setup | ntfy has not enabled the required account action | Preserve topic and return to the same step |
| Private topic unavailable | Can this topic be protected? | Compare ntfy plan/server options | Advanced self-hosting | Recommended private delivery is unavailable on this provider setup | Never downgrade silently to an unprotected topic |
| Android permission denied | Why did no notification appear? | Open Android notification settings | Send another test later | Pulse cannot confirm phone delivery while notifications are blocked | Return to the test step after permission changes |
| ntfy token unavailable | Can I continue without it? | Create or replace token | Open ntfy account; Advanced | Cloud delivery cannot be configured yet | Preserve every non-secret setup value |
| Deployment path selection | How should I run Pulse? | Quick setup with Netlify | Connect another compatible runner | No runner exists yet | Explain guided vs compatible-manual support honestly |
| Quick-setup adapter unavailable | Can I still use Pulse? | Retry adapter | Connect another compatible runner; Advanced | This guided provider path is currently unavailable | Do not imply the Pulse protocol itself is down |
| Deployment not started | Who owns the runner? | Continue selected quick setup | Choose another adapter; Advanced hosting | No runner exists yet | Reopen the selected adapter handoff |
| Netlify account unverified | Why can I not deploy? | Finish account verification | Return to Pulse | Netlify has not enabled deployment | Preserve the native pending session |
| Git-provider authorization required | Why is Netlify asking for access? | Review and grant provider access | Cancel deployment | Netlify needs permission to clone the user's copy | Explain ownership before reopening |
| Template clone or team permission denied | Where did deployment stop? | Choose an authorized account/team | Advanced hosting | No Pulse runner was created | Preserve setup; do not poll for a site |
| Deployment in progress | Is it working? | Return after deployment | Open selected provider | Waiting for provider completion | Poll only after endpoint is known |
| Invalid site URL | Is this my Pulse site? | Correct address | Open selected provider | Address is not a compatible Pulse service | Preserve the entered value |
| Runner protocol/version incompatible | Can this deployment connect? | Update or deploy a compatible runner | Choose another runner | This runner does not satisfy Pulse's required capabilities/version | Send no setup proof; show the failed capabilities |
| Deployment fingerprint mismatch | Is this the runner I created? | Return to the provider project | Enter a different address | This site was not created by this pending setup | Send no signature or credential to the origin |
| Pairing in progress | Is my Mac connecting? | None while active | Cancel when safe | Connecting securely | Time out with retry; never double-issue silently |
| Invalid origin-bound proof | What failed? | Retry this connection | Restart with this deployment | The runner could not verify this installation | Preserve deployment and pending native key |
| Additional-device code used or expired | Can I recover? | Create/use a new code | Advanced recovery | This invitation can no longer be used | Preserve every existing client and deployed site |
| Keychain failure | Is the runner broken? | Retry local connection | View system guidance | Runner is deployed; this Mac is not connected | Roll back issued client credential |
| Config write failure | Did setup finish? | Retry local setup | Choose managed location | No local connection was saved | Atomic retry; no partial config |
| Runner booting | Must I redeploy? | Check again | Open selected provider | Runner is still starting | Bounded polling then diagnostic state |
| Runner unhealthy | What needs repair? | Open diagnostics | Open selected provider | Connected, but runner is stale or unavailable | Preserve connection and retry |
| Test sending | Did Pulse send it? | None while active | Cancel | Sending a test notification | Idempotent retry |
| Test accepted | Did my phone receive it? | I got it | Send again; It did not arrive | Provider accepted delivery; phone receipt unconfirmed | Guided Android/ntfy checks |
| Test rejected | What rejected it? | Repair notification setup | Open runner-provider secrets | Notification provider rejected delivery | Replace ntfy config, then retest |
| Setup complete | What now? | Create first reminder | View reminders | Phone and runner are connected | Settings exposes tests and repair |
| Existing healthy setup | Is Pulse ready? | Use Pulse | Settings | Connected and runner online | Silent restoration |
| Existing invalid credential | Did I lose data? | Repair access | Connect different runner | Remote data is untouched; this Mac cannot authenticate | New pairing flow |
| User abandons setup | Will I be charged or notified? | Resume later | Start over | Any runner deployment remains user-owned | Explain how to remove it through the selected adapter/provider |
| Pending setup restored | Did Pulse remember my place? | Continue from saved step | Review setup details; Start over | Redacted progress and any known deployment were restored | Never request the ntfy token again from Pulse |
| Pending setup schema is stale | Can setup continue after an update? | Migrate and continue | Preserve and view recovery | Workshop has not modified the old record yet | Fail closed and retain the last valid record |

## Content design rules

- Lead with the user's outcome: phone notifications, cloud delivery, or secure
  connection. Implementation nouns belong in Advanced details.
- Do not use `workspaceRoot`, `credentialRef`, bearer token, environment
  variable, Blob, callback origin, or Keychain as required setup vocabulary.
- Name external providers when the user is about to leave Pulse or accept their
  terms. Do not disguise third-party ownership.
- Use verbs that match consequences: **Quick setup with Netlify**, **Connect
  another compatible runner**, **Connect this runner**, **Send test
  notification**, **Start over**.
- Status text must distinguish requested, accepted, confirmed, connected,
  online, stale, rejected, and unreachable. "Success" is too vague.
- Never label a phone connected solely because ntfy accepted an HTTP request.
- Never imply a provider is free. Say that the user's provider account controls
  pricing and usage.
- Error messages state what remains safe. Example: "Your runner is deployed,
  but this Mac could not save its secure connection. Nothing was deleted."
- Recovery keeps completed work whenever possible; users should not redeploy to
  fix a local credential or phone subscription.

## Design quality plan

No production setup UI begins from a component library or the existing folder
form. The design phase must compare at least three meaningfully different
experience structures using realistic content and states:

1. **Linear guided setup:** one focused decision per screen with persistent
   progress and strong external-handoff return points.
2. **Setup checklist:** one overview that exposes all dependencies and lets a
   user complete independent provider steps in either order.
3. **Contextual split view:** instructions and status remain visible beside the
   active action, optimized for browser-to-Workshop handoffs on a Mac.

These are interaction structures, not visual themes. Each direction must vary
hierarchy, density, navigation, and recovery behavior—not merely colors.

Direction C, Companion Split View, was selected on 2026-08-15. Its production
contract is phase-aware progressive disclosure: setup opens on a focused
single-task doorway, then introduces the companion when cross-device work
begins. The companion names the current physical surface and action; it does
not explain its own clarity. Compact routes for connecting an existing Pulse
or validating a compatible self-managed runner stay subordinate to the guided
start. Experienced routes may skip provider tutorials, never identity, origin,
credential, or delivery proof.

The chosen direction is selected using:

| Criterion | Required evidence |
| --- | --- |
| Product fit | A first-time user can explain what Pulse needs and who owns the services. |
| Laptop composition | The layout uses a 1280–1440px Workshop window intentionally without stretching instructions into unreadable lines. |
| Handoff clarity | The user always knows whether the next action happens in Pulse, a browser, or the phone. |
| State scalability | The same structure handles new setup, resume, failure, repair, and connect-existing flows. |
| Security comprehension | Sensitive and one-time values are explained without training the user as an infrastructure operator. |
| Accessibility | Keyboard, screen reader, zoom, contrast, and reduced-motion requirements can be met without a parallel layout. |
| Implementation fidelity | The design maps to the real provisioning and service contracts rather than a fake local success state. |

### Required prototype set

Before production UI work, render and walk through:

1. welcome and cost/account ownership;
2. all four phone-setup task screens plus signup/verification, protected-topic
   authorization, Android permission, and token recovery states;
3. runner-path selection, unavailable adapter, Netlify signup/verification,
   Git-provider authorization, permission failure, successful quick deployment,
   compatible-runner connection, and incompatible protocol/version;
4. return from successful deployment by preferred and fallback routes;
5. origin fingerprint verification, pairing in progress, and success;
6. invalid URL, fingerprint mismatch, failed proof, deployment failure, local
   secure-storage failure, and runner-still-starting states;
7. test notification waiting, confirmed, rejected, and not-received states;
8. completion into the connected empty dashboard;
9. connect-existing flow;
10. abandoned/resumed setup;
11. stale and migrated pending setup;
12. Settings repair surfaces; and
13. Advanced manual/self-hosted setup.

Render the complete set at the primary laptop viewport and the states most
likely to break at a narrow width and 200% text zoom. Use public fictional data
only.

### Usability validation

The prototype gate requires observed use, not an internal narrated demo:

- Lindsay completes the full path as the product owner.
- At least two additional participants who have not used Pulse and do not work
  as software developers attempt the setup with test provider accounts.
- The observer may not tell participants where to click or translate product
  vocabulary during the attempt.
- Record completion, active time excluding provider waits, abandoned or wrong
  turns, requested explanations, misunderstood account/cost ownership,
  permission failures, and every point requiring intervention.
- Both unfamiliar participants must reach the confirmed test notification
  without terminal, docs, raw JSON, or observer intervention.
- Any blocking or repeated comprehension problem changes the prototype and is
  retested with a fresh unfamiliar participant; the original participants are
  not reused as proof after learning the flow.

Usability notes contain no provider credentials, private topics, account
identifiers, or real reminders. They record behavior and redacted state only.

### Interaction and accessibility standards

- One clear primary action per step.
- Visible step name and progress without treating external provider time as a
  completed step.
- Every external link states where it opens.
- Browser return preserves the current setup session.
- Provider signup, verification, permission, and plan mismatch screens preserve
  the user's place and identify the next action without blaming Pulse.
- Native controls, programmatic labels, error association, status live regions,
  and predictable focus movement.
- Focus returns to the initiating control after dialogs or failed handoffs.
- No color-only state, icon-only provider status, or motion-only progress.
- Reduced-motion behavior and no ornamental waiting animation.
- Destructive **Start over** and **Disconnect** actions name what is retained
  remotely and require confirmation.
- Host palette inheritance and exact standalone Pulse fallbacks remain intact.
- Pulse styles remain under `.pulse-ui` and cannot affect Workshop chrome or
  other plugins.

## Recommended technical architecture

### Why origin-bound pairing replaces manual API-token copying

The current production API uses one `PULSE_API_TOKEN` that must match a local
Keychain entry. Asking a nontechnical user to generate, transport, and store
that token is the sharpest remaining developer step. Passing it through the
Pulse webview would violate the existing secure boundary.

The recommended design introduces one-time, origin-bound proof-of-possession
pairing:

```text
Workshop native host
  -> creates a pending setup session and ephemeral keypair
  -> keeps the private key in Keychain
  -> returns public key + fingerprint to Pulse

Pulse setup UI
  -> gives the public key to the selected deployment adapter
  -> receives or asks for the deployed site URL

User's compatible runner
  -> publishes the deployed public-key fingerprint and a nonce challenge
  -> verifies a signature bound to its own canonical HTTPS origin
  -> issues a per-installation client credential
  -> stores only its verifier/hash and registration metadata

Workshop native host
  -> rejects a mismatched fingerprint before sending a proof
  -> signs origin + challenge + installation + API version
  -> submits the proof to the same pinned origin
  -> receives the durable credential internally
  -> stores it in Keychain
  -> writes non-secret pulse.config.json
  -> returns only status and metadata to Pulse
```

The public key and fingerprint may appear in the setup UI and client-side
deployment URL because they are not secrets. The ephemeral private key, durable
credential, and ntfy token may not. The signed payload includes the normalized
runner origin, so a malicious service cannot relay the challenge to the real
deployment and harvest the returned credential.

A deep-link or provider return may supply the candidate site URL, but it is a
convenience signal only. Cryptographic proof bound to the deployment's public
key and canonical origin is the ownership test for both the preferred and
manual fallback paths.

### Cloud setup contract

The new runner setup layer should add:

- a public, bounded service-manifest endpoint that reports service identity,
  supported API version, canonical origin, setup state, deployed public-key
  fingerprint, and no private reminder data;
- a bounded challenge endpoint with unpredictable, single-use, expiring
  nonces;
- an origin-bound proof endpoint with uniform authentication errors, attempt
  limits, response-size bounds, signature verification, and replay protection;
- per-installation credential records stored as hashes/verifiers, with created,
  last-used, and revoked timestamps;
- an authenticated endpoint to create short-lived pairing codes for additional
  installations;
- an authenticated endpoint to revoke a specific client;
- an authenticated, idempotent test-notification endpoint that does not create
  a reminder occurrence or history noise;
- server-generated notification-action signing material initialized once in
  private storage;
- a bootstrap record that permanently retires the deployment public key after
  first pairing while retaining only the registration evidence needed for
  audit and migration; and
- compatibility with the current single environment API token during migration.

Exact endpoint names and schemas are locked by tests in Phase G2 before
implementation. They remain under the existing `/api/` request boundary.

### Runner compatibility contract

Pulse treats a deployment as compatible only when it provides:

- an always-on or reliably scheduled execution mechanism capable of the Pulse
  runner cadence;
- private durable storage with the locking/atomicity required by occurrence,
  history, bootstrap, credential, and rate-limit state;
- a stable canonical HTTPS origin and the versioned manifest,
  challenge/proof, authenticated API, phone-action, and health endpoints;
- a private secret store for notification-provider credentials;
- outbound HTTPS to the selected notification provider;
- a way for the owner to inspect health, rotate secrets, export data, update
  Pulse, and delete the deployment; and
- user-owned quotas, terms, access control, and billing.

The public runner protocol and storage interfaces belong to Pulse. Provider
adapters translate a provider's scheduling, persistent storage, secret store,
canonical-origin metadata, deployment status, dashboard links, update flow,
and deletion flow into that contract. Core reminder, pairing, management, and
notification behavior may not branch on a provider name.

Every supported quick-setup adapter declares versioned capabilities and UI
metadata, including:

- stable adapter identifier and display name;
- deploy/open/manage/delete handoff URLs or native actions;
- whether setup values can be safely pre-filled;
- secret storage and deploy-context guarantees;
- canonical-origin derivation and return mechanism;
- storage/locking implementation and runner cadence;
- pricing/ownership disclosure link;
- supported recovery operations; and
- adapter contract and live-smoke-test version.

Unknown providers do not need Pulse-specific code if their deployed runner
already satisfies the public protocol. They use **Connect another compatible
runner**. A provider is promoted to **Quick setup** only after its adapter
passes the complete G3 security, usability, accessibility, deployment,
recovery, and deletion gates.

### First quick-setup adapter: Netlify

The Pulse repository should become a supported Netlify template without
embedding any user value. The template must:

- declare only the setup values that genuinely require the user;
- give every value a plain-language description;
- accept the ephemeral public key and generated topic through Netlify's
  client-side Deploy to Netlify URL fragment, never a private key or durable
  credential;
- default the ntfy server safely while allowing an explicit alternative;
- derive the site's canonical public HTTPS origin from trusted runtime
  metadata;
- never print secret environment values in build or function logs;
- bootstrap idempotently across repeated function starts;
- keep all real definitions and state in the user's own Blobs store;
- provide a harmless setup-status landing page with no private data; and
- document how the user deletes the site and its data.

Use Netlify's supported template-deployment surface rather than scripting
against undocumented UI. Netlify documents that template values may be passed
in the URL fragment for client-side processing without entering Netlify logs;
the G0 spike must still inspect the real rendered form and reject this path if
it exposes an irreducibly developer-oriented experience. See the official
[Deploy to Netlify documentation](https://docs.netlify.com/deploy/create-deploys/)
and
[environment-variable documentation](https://docs.netlify.com/build/environment-variables/overview/).

### Generic Workshop capability contract

Workshop needs a small generic extension beside
`read_secure_service_metadata` and
`request_configured_secure_service`. Exact public names may change during the
host review, but the capability must support these operations:

1. **Begin managed secure-service setup**
   - allocate a host-managed private directory outside repositories;
   - create a versioned pending setup record and ephemeral asymmetric keypair;
   - keep the private key and generated private topic in native storage;
   - return only the opaque setup identifier, public key, display fingerprint,
     generated topic, and non-secret progress/path status.
2. **Complete managed secure-service setup**
   - accept a candidate HTTPS origin and fixed relative manifest/challenge/proof
     paths;
   - retrieve the pending private key natively;
   - verify the deployment fingerprint before signing;
   - bind the signature to canonical origin, nonce, installation identifier,
     and supported API version;
   - pin every request to the same origin and reject redirects;
   - receive the durable credential without returning it to JavaScript;
   - store it in the generic Keychain service;
   - write validated service metadata atomically; and
   - return redacted connection metadata.
3. **Cancel or repair setup**
   - remove pending local material;
   - compensate for partially issued credentials when possible;
   - preserve a deployed site's matching private key until the user explicitly
     abandons or replaces that deployment;
   - preserve an already-working connection unless replacement succeeds.
4. **Connect a manually managed root**
   - retain the current expert path with all existing root, symlink, endpoint,
     path, body, timeout, and redaction checks.

The contract must remain provider- and plugin-neutral. It may accept a service
identity expected by the calling plugin, but it must not contain `Pulse`,
`ntfy`, or `Netlify` business logic or UI. Pulse continues to pass
`configFile: "pulse.config.json"`.

### Existing-installation compatibility

- A valid current `pulse.config.json` and Keychain credential bypass the wizard.
- Current Netlify deployments using `PULSE_API_TOKEN` remain functional during
  this feature release.
- Migration to a per-installation credential is explicit and reversible until
  the new connection is proven.
- The old token is not removed automatically. Any later deprecation is a
  separate reviewed release.
- The private local folder is never moved or deleted merely to adopt managed
  setup.
- Existing reminder definitions, occurrence state, history, ntfy topic, and
  phone subscription remain untouched.

## Security and privacy requirements

- Pairing and production requests require HTTPS outside explicit local
  development.
- First-run pairing uses an ephemeral Ed25519 or equivalently reviewed keypair;
  the private key never leaves Workshop native storage.
- Challenges have at least 128 bits of randomness, short expiry, atomic
  single-use invalidation, uniform errors, and attempt limits shared across
  concurrent function instances.
- The signed proof covers normalized canonical origin, challenge,
  installation identifier, public-key fingerprint, and API version. Redirects,
  origin substitution, downgrade, replay, and challenge relay are rejected.
- Public setup endpoints cannot read definitions, history, credentials, or
  runner state beyond bounded setup metadata.
- Additional-device codes have at least 96 bits of randomness, a ten-minute
  expiry, uniform errors, attempt limits, origin/installation binding, and
  atomic single-use invalidation.
- Durable client credentials are random, installation-specific, revocable, and
  stored server-side only as a verifier/hash.
- The durable runner credential never appears in Pulse props, state, DOM,
  errors, logs, local/session storage, snapshots, configuration, or returned
  native command payloads.
- The ntfy token is entered only in the user's browser on the verified,
  user-owned runner origin and remains in the adapter-approved encrypted
  provider-private store. It never enters the deployment template or build.
- The ntfy topic is treated as private even though it is not sufficient
  authentication by itself.
- The native host validates endpoint origin, DNS/IP class, redirects, method,
  path, content type, body size, response size, timeout, service identity,
  deployed fingerprint, and signed origin binding.
- Provisioning follows an explicit transaction order and compensates on
  failure; no half-written config or orphaned Keychain record is accepted.
- Start-over removes pending local setup state only after explaining that the
  user's runner deployment remains at the selected provider and may incur
  usage.
- Public fixtures and visual evidence use fictional provider values and
  reminders.
- Privacy/public-boundary lint gains patterns for setup codes, pairing
  credentials, real runner origins/provider project names, and ntfy account
  identifiers.
- Pending setup records and keys follow the resume contract: pre-deploy stale
  sessions may expire, deployed sessions require explicit abandonment, and
  schema migration never destroys the last valid record.

## TDD working agreement

Every implementation phase follows the same loop:

1. **Red:** write the smallest failing behavior, contract, security, or render
   test that describes the phase outcome.
2. **Green:** implement only enough production behavior to satisfy the
   contract.
3. **Refactor:** remove duplication and improve boundaries while the complete
   suite stays green.
4. **Review:** run product/function, visual/interaction, and production-proof
   gates separately.
5. **Regression:** write a failing test before fixing every defect discovered
   during review or live setup.
6. **Clean proof:** rerun the phase from clean checkouts/consumer installs
   before marking it complete.

No phase is complete because mocks pass while the real mounted surface or
native boundary is unverified. No design phase is complete because one default
screen looks polished.

## Phased workplan

### G0 — Baseline, research, and decision lock

**Outcome:** Freeze the current setup journey, external-provider constraints,
security boundary, migration requirements, and measurable target before code.

**Work:**

- Record the current first run from a clean Workshop profile through live
  notification delivery.
- Capture every manual provider, file, command, and credential step.
- Lock the provider-neutral runner, storage, secret, scheduling, origin,
  pairing, health, management, update, and deletion contracts before adapter
  work.
- Define the versioned quick-setup adapter interface and the evidence required
  to promote any provider from compatible/manual to guided setup.
- Verify current official Netlify template/callback behavior and ntfy account,
  topic, token, and Android-subscription behavior.
- Capture the real Netlify template form with required variables and fail the
  recommended path if friendly labels cannot prevent raw infrastructure work.
- Verify exactly how the first adapter stores and captures the ntfy token,
  including provider encryption, runtime/build visibility, deploy-context
  isolation, arbitrary-read resistance, log/artifact redaction, session expiry,
  and owner access. Record why template-time entry passed or failed against the
  existing Pulse threat model.
- Verify ntfy behavior for new/unverified accounts, private-topic availability,
  token creation, and Android permission denial on supported provider tiers.
- Threat-model bootstrap, origin substitution, challenge relay, pairing,
  abandonment, replay, distributed rate limiting, partial failure, and recovery.
- Decide the deployment-return convenience mechanism while keeping
  origin-bound proof mandatory for every path.
- Write versioned service-manifest, setup-state, pairing, client-registration,
  revocation, and test-notification contracts as fixtures.
- Write adapter capability, setup-handoff, provider-link, and deletion fixtures
  using provider-neutral core types plus a Netlify implementation fixture.
- Write the versioned native pending-setup schema, redacted view, retention,
  migration, cancellation, and cleanup rules as fixtures.

**Tests/contracts written first:**

- red contract fixtures for every proposed setup response and error;
- dependency-boundary tests proving the runner core, pairing service, Pulse
  plugin state machine, and generic Workshop capability do not branch on or
  import a runner provider;
- adapter conformance fixtures that every future quick-setup provider must
  satisfy unchanged;
- a secret-flow assertion listing which process may observe each value;
- an ntfy-token exposure matrix covering the runner-owned setup page, template
  URL/form, repository, build, Functions, Blobs, previews, logs, artifacts,
  Netlify UI/API, Workshop, and Pulse;
- cryptographic transcript fixtures for valid origin binding, wrong origin,
  wrong fingerprint, downgrade, redirect, replay, and relay attempts;
- a migration fixture representing the current production deployment;
- a current-journey acceptance transcript that the new flow must replace.

**Gate:** No unresolved design assumes a provider API or redirect that has not
been verified against official behavior. Netlify may be approved as the first
quick-setup adapter, rejected, or replaced without changing the Pulse product
contract. Lindsay is consulted only if the best supported alternative changes
user cost, privacy, account ownership, or the visible product experience.

### G1 — Experience directions and complete prototype

**Outcome:** Select and approve a setup structure that works across the full
state matrix before production UI implementation.

**Work:**

- Produce the three interaction directions defined above.
- Test each with the complete realistic setup content, not lorem ipsum.
- Choose one direction using the documented criteria.
- Build a connected clickable prototype covering the required prototype set.
- Walk the browser and phone handoffs without narration.
- Run the documented usability validation with Lindsay and at least two
  unfamiliar nondeveloper participants; revise and retest blockers with a fresh
  participant.
- Review at the primary Mac viewport, narrow width, keyboard-only, screen
  reader landmarks, reduced motion, and 200% text zoom.

**Tests/contracts written first:**

- scripted task walkthrough with success/failure expectations;
- a redacted usability protocol, observation rubric, and completion record;
- content inventory and state coverage checklist;
- automated accessibility assertions for prototype semantics where practical;
- screenshot manifest requiring every critical state and viewport.

**Gate:** The prototype passes the product/function and visual/interaction
reviews, and both unfamiliar participants reach a confirmed test notification
without observer intervention. Production code does not begin with unresolved
placeholder states.

### G2 — Runner bootstrap and pairing model

**Outcome:** A newly deployed user-owned runner can initialize safely, pair one
installation, issue/revoke additional client credentials, and send a clean
test notification without manual API-token synchronization.

**Work:**

- Add versioned setup and client-registration models with migrations.
- Implement service manifest, bootstrap status, challenge, origin-bound proof,
  create-additional-device-code, revoke-client, and test-notification endpoints.
- Verify the deployment public key and signed origin-bound transcript before
  issuing any durable client credential.
- Hash durable client credentials and setup codes; store no recoverable durable
  client token server-side.
- Add fake-clock-tested expiry, atomic replay protection, distributed attempt
  limiting backed by shared state, idempotency, and bounded errors.
- Generate notification-action signing material once in private server state.
- Keep the existing environment API token valid during migration.
- Ensure test notification chains are isolated and cleanable.

**Tests written first:**

- first bootstrap, repeated bootstrap, and concurrent bootstrap;
- valid origin-bound pair; wrong public key, fingerprint, origin, API version,
  signature, and installation identifier; redirect, downgrade, replay, and
  challenge relay attacks;
- fake-clock challenge expiry and atomic single use under concurrent requests;
- distributed brute-force limiting across multiple simulated runner instances
  sharing the same private store, plus the Netlify adapter implementation;
- valid, invalid, expired, replayed, origin-mismatched, and used
  additional-device codes; revoked clients; and additional-device pairing;
- raw credential absence from Blobs, logs, responses after pairing, errors, and
  snapshots;
- credential-hash verification and constant-shape authentication failures;
- service identity/version mismatch;
- test notification success, provider rejection, idempotent retry, rate limit,
  and chain cleanup;
- legacy `PULSE_API_TOKEN` compatibility and rollback migration;
- corrupted or partial setup-state recovery.

**Coverage adequacy:** Every branch in bootstrap, challenge verification,
origin binding, credential issuance, revocation, and distributed rate limiting
must map to a named test. A targeted mutation pass must demonstrate that
removing origin binding, expiry, replay invalidation, or credential hashing
causes the suite to fail.

**Gate:** Cloud contract and security review pass independently of the UI.

### G3 — Deployment-adapter contract and Netlify quick setup

**Outcome:** Pulse has a provider-neutral deployment-adapter contract, and a
user can create a compatible runner through the first supported,
understandable Netlify quick-setup adapter.

**Work:**

- Implement adapter capability discovery, provider handoff, progress, return,
  manage, repair, update, export, and delete contracts without putting provider
  names in core setup state.
- Add adapter conformance tests and a fictional provider fixture that proves a
  second implementation does not require core UI or pairing changes.
- Add and validate the first Netlify adapter's template metadata for public
  setup values and a runner-owned secure notification-credential page.
- Pre-fill only the non-secret setup public key, topic, and default server
  through the documented client-side URL fragment; never collect the ntfy token
  in the template form.
- Remove the need for a manually constructed public base URL.
- Add the setup-status landing page and verified return/fallback behavior.
- Make bootstrap idempotent and safe during cold starts and redeploys.
- Document ownership, provider billing, updates, deletion, and export before
  removal.
- Keep production secrets out of build output and deploy logs.
- After origin-bound pairing, create a native-opened, short-lived,
  single-use runner setup session. Store the submitted ntfy token under a fixed
  site-scoped Blobs key, prevent arbitrary reads and writes, enforce production
  runtime use, and block builds and untrusted deploy contexts from receiving it.

**Tests written first:**

- provider-neutral adapter contract and schema-version tests;
- fictional second-adapter conformance tests for deploy, return, origin,
  secrets, health, repair, update, export, and deletion metadata;
- boundary tests rejecting provider-specific branches/imports in runner core,
  pairing, Pulse setup state, and Workshop native setup;
- static template-contract test for required/forbidden variables and helpful
  descriptions;
- tests deriving canonical origin from trusted deployment metadata;
- clean-template build and function typecheck;
- deploy-context tests for preview vs production behavior;
- browser render/interaction proof of the actual Netlify template form,
  including signup, verification, Git-provider authorization, team permission,
  template-clone failure, and user cancellation handoffs;
- log-redaction and public-artifact scans;
- runtime/build/preview exposure tests for the ntfy token plus documented proof
  that only the production runner and encrypted site store observe it;
- setup-browser session expiry, single-use, origin, CSRF, fixed-key, no-echo,
  and log/artifact redaction tests;
- clean Git-consumer installation and deploy build;
- disposable-site smoke checklist for first deploy, redeploy, and deletion.

**Gate:** The fictional adapter proves core provider independence, and a clean
user-owned disposable Netlify deployment reaches an unpaired healthy state
without terminal intervention, a committed private value, requiring the user
to interpret raw environment-variable mechanics, or exposing the ntfy token
outside its approved production runtime. If the actual Netlify template UI or
secret model cannot meet that bar, Netlify is not promoted as a quick-setup
adapter. Another adapter may replace it without reopening the core product
design; documentation may not waive the failure.

### G4 — Generic Workshop native provisioning capability

**Outcome:** Plugins can establish a managed secure-service connection without
placing durable credentials in the webview or requiring a hand-written local
config.

**Repository boundary:** This phase changes Workshop's generic host
capability. It does not add Pulse UI or Pulse-named native commands to Workshop.

**Work:**

- Finalize generic begin, complete, cancel, repair, and managed-root contracts.
- Implement the versioned native pending-setup record and redacted view.
- Create the host-managed private directory with restrictive permissions.
- Generate/store the ephemeral keypair natively, verify the deployed
  fingerprint, sign the origin-bound challenge, and pin the exchange to that
  endpoint without redirects.
- Store the durable credential in the existing generic Keychain service.
- Write the service metadata atomically and return redacted metadata only.
- Add compensation for pairing success followed by Keychain/config failure.
- Preserve the existing manual-root read/request capabilities unchanged.
- Expose capability availability so Pulse can choose guided or manual setup
  truthfully on older Workshop releases.

**Tests written first:**

- managed root is absolute, private, regular, non-symlinked, and outside public
  repositories;
- unsafe endpoint, redirect, DNS/IP, path, method, body, response, timeout, and
  service identity rejection;
- wrong fingerprint, origin substitution, challenge relay, signature replay,
  and API-version downgrade rejection before credential storage;
- valid native pair stores a credential but returns no credential bytes;
- source/DOM/log/error/snapshot assertions for credential absence;
- atomic config write and restrictive file permissions;
- rollback on network, Keychain, filesystem, revocation, and process-restart
  failures at every transaction boundary;
- pending-record creation, redaction, restart restoration, pre-deploy stale
  cleanup, deployed-session retention, explicit abandonment, schema migration,
  migration rollback, cancellation, and safe retry;
- existing configured service remains usable if replacement fails;
- plugin-neutral naming and a boundary test proving no Pulse package/source
  dependency.

**Coverage adequacy:** Every transaction boundary and pending-record lifecycle
branch requires direct failure injection. A targeted mutation pass must prove
that removing fingerprint comparison, origin binding, redirect rejection,
atomic config replacement, or rollback makes the suite fail.

**Gate:** Workshop's Rust tests, desktop tests, desktop typecheck, security
review, and a real Keychain integration smoke test pass before Pulse consumes
the capability.

### G5 — Pulse-owned setup wizard

**Outcome:** Pulse replaces the private-folder front door with the approved
guided new/existing/advanced experience.

**Work:**

- Implement a deterministic setup state machine outside React.
- Render the approved welcome, phone, deploy, pairing, testing, completion,
  existing-runner, resume, failure, and Advanced states.
- Render **Quick setup with Netlify** and **Connect another compatible runner**
  as distinct truthful support levels driven by adapter capabilities, not
  provider conditionals in the core state machine.
- Render explicit ntfy signup/verification, private-topic/plan mismatch,
  Android permission denial, Netlify signup/verification, Git-provider
  authorization, and clone/team-permission recovery states.
- Integrate only through the generic Workshop commands and the existing
  constrained service requester.
- Read and update the native redacted pending-setup view instead of inventing a
  parallel local-storage source of truth. Keep topic and all pending key
  material in the native record; retain no setup state in browser storage.
- Preserve the active host theme, standalone fallback, route ownership, and
  current reminder-management experience.
- Suppress the wizard for a valid restored connection.
- Detect older Workshop capability versions and explain the supported upgrade
  or Advanced path rather than exposing a dead button.

**Tests written first:**

- pure setup-machine transitions for every state and invalid transition;
- mounted new-setup, connect-existing, Advanced, abandonment/resume, start-over,
  and successful completion workflows;
- mounted adapter-selection, Netlify quick-setup, compatible-runner, unavailable
  adapter, and fictional second-adapter workflows using the same state machine;
- mounted provider signup/verification, plan mismatch, Android permission,
  Git-provider authorization, clone/team denial, and cancellation workflows;
- external-link allowlist and safe URL normalization;
- service-manifest mismatch, fingerprint mismatch, deployment-return
  validation, and proof-failure handling;
- loading, timeout, retry, provider rejection, runner booting, and local
  provisioning failures;
- restoration bypass with existing valid configuration;
- capability-version fallback on older Workshop hosts;
- no durable credential or ntfy token in props, DOM, React state fixtures,
  local/session storage, serialized progress, errors, or logs;
- no pending topic, public-key session metadata, or provider acknowledgement in
  local/session storage; restart restoration comes only from the native
  redacted view;
- keyboard order, focus restoration, live-region announcements, labels,
  error association, and automated accessibility checks;
- representative host-theme and standalone-fallback render tests;
- strict `.pulse-ui` style scoping and dependency-boundary tests.

**Coverage adequacy:** The setup state machine requires named tests for every
transition and rejection, with no uncovered decision branches in the
state-machine module. A mutation pass must prove that removing resume,
fingerprint-mismatch, provider-denial, or secret-redaction handling fails the
suite.

**Gate:** The mounted production flow matches the approved prototype and
completes with no documentation at the primary viewport.

### G6 — Repair, additional-device, and migration experience

**Outcome:** Setup remains humane after the happy path and does not strand
existing users.

**Work:**

- Add Settings actions for test notification, additional phone, additional Mac,
  client revocation, repair access, and open provider dashboard.
- Add migration from the current local config/single-token installation to a
  per-installation credential without changing reminders or ntfy subscription.
- Add last-resort provider-owner recovery for loss of every local credential.
- Make Disconnect and Start over state exactly what remains deployed and what
  may continue to incur provider usage.
- Add export/delete instructions before provider-site removal.
- Drive provider dashboard, secret repair, update, export, and deletion actions
  through adapter metadata with a documented manual fallback for compatible
  runners that do not have a guided adapter.

**Tests written first:**

- another-Mac pairing, fake-clock ten-minute invitation expiry, origin and
  installation binding, replay rejection, and per-client revocation;
- ntfy token rejection vs runner outage vs invalid local credential diagnosis;
- phone replacement without runner redeploy;
- safe migration success, cancellation, partial failure, retry, and rollback;
- disconnect preserves remote data; explicit remote deletion removes only the
  intended deployment after export confirmation;
- settings actions remain accessible and do not reveal credentials;
- stale saved setup sessions upgrade or expire cleanly.

**Gate:** Every recovery row in the state matrix has a tested action and an
honest consequence.

### G7 — Documentation, operations, and public boundary

**Outcome:** Normal setup is self-explanatory in-product; docs support Advanced,
security, recovery, and maintainers without reintroducing the old front door.

**Work:**

- Rewrite Getting Started around the guided setup.
- Move raw environment variables and hand-written config to Advanced setup.
- Document provider ownership and cost plainly.
- Update private config, deployment, verification, security, backup/restore,
  migrations, operations, Workshop capability, and release checklist docs.
- Add credential rotation, client revocation, site deletion, data export, and
  lost-installation recovery runbooks.
- Update diagrams and examples to the pairing model.
- Ensure docs do not promise capabilities unavailable in the pinned Workshop
  version.

**Tests/contracts written first:**

- docs-link and required-section checks;
- command/example validation for Advanced setup;
- stale-term scan for the old normal-path instructions;
- privacy scan for real account IDs, topics, sites, paths, reminders, and
  credentials;
- version compatibility matrix check.
- runner protocol and quick-setup adapter authoring/conformance documentation;
- stale-language scan rejecting claims that Netlify is required by Pulse core.

**Gate:** A new user needs no documentation for normal setup; an operator can
complete every recovery procedure from the docs without source-code inference.

### G8 — Production proof and release

**Outcome:** The complete guided BYO experience is proven against the
provider-neutral contract and the first real Workshop, Netlify, ntfy, and
Android path before either repository is promoted.

**Work:**

- Run the clean-start acceptance journey with a disposable user-owned Netlify
  site, test ntfy topic/token, clean Workshop profile, and dedicated test
  Keychain entries.
- Run the adapter conformance suite against Netlify and the fictional second
  adapter, proving that the latter requires no core setup, pairing, or Workshop
  branch.
- Run a final unassisted acceptance session with at least one fresh
  nondeveloper who did not participate in prototype validation.
- Inspect desktop and narrow renders for every critical state.
- Verify browser handoff, return, deployment delay, app restart, and Android
  notification receipt.
- Verify existing production Pulse data and notifications remain intact through
  migration.
- Run security, privacy, accessibility, dependency, packaging, and clean
  consumer checks.
- Commit and pin Pulse and Workshop independently; do not publish a mixed dirty
  worktree or claim compatibility before both exact SHAs pass together.

**Required automated evidence:**

```text
Pulse
  npm test
  npm run test:coverage
  npm run test:theme-render
  npm run typecheck
  npm run typecheck:netlify
  npm run build
  npm run build:plugin
  npm run docs:check
  npm run lint
  npm run format:check
  clean Git-consumer install and prepare build

Workshop
  focused desktop integration tests
  complete desktop TypeScript tests
  desktop typecheck
  complete Rust tests
  generic capability security/boundary tests
```

**Required human evidence:**

- a first-time task walkthrough without terminal or docs;
- a fresh unfamiliar participant completing setup without observer
  intervention, with redacted findings resolved and the gate repeated if they
  hit a blocker;
- Android receipt of the isolated test notification;
- a real reminder proving the unchanged due, Snooze/no-action, Done, and chain
  cleanup behavior;
- visual review at the primary Mac viewport, narrow width, and 200% text zoom;
- keyboard-only and screen-reader spot checks;
- provider ownership and deletion copy review; and
- successful restart/reconnection after Workshop and Pulse package updates.

**Gate:** Release only when product/function, visual/interaction, and
production-proof reviews all pass after their findings are resolved and the
reviews are repeated.

## Test coverage map

| Risk | Primary test layer | Required proof |
| --- | --- | --- |
| Setup state gets stuck or lies | Pure unit tests | Every valid/invalid transition, resume, cancel, retry, and completion rule |
| Provider handoff loses context | Mounted UI + browser workflow | Signup, verification, authorization, permission denial, external open, return, fallback URL entry, restart/resume |
| Runner core becomes Netlify-specific | Dependency boundary + adapter conformance | Fictional second adapter passes without core UI, pairing, or Workshop changes |
| Template leaks ntfy credential | Provider contract + deploy integration | Token absent from URL, repo, logs, artifacts, previews, Pulse/Workshop, and every unapproved scope |
| Durable secret reaches webview | Rust/unit/static boundary tests | No token in command return, JS state, DOM, storage, logs, errors, or config |
| Wrong or malicious origin captures setup | Rust + runner cryptographic contract tests | Deployed fingerprint match, origin-bound signature, redirect/downgrade/relay rejection |
| Pairing can be replayed or guessed | Runner integration/security tests | Challenge entropy/expiry, distributed rate limit, uniform errors, atomic single use, revocation |
| Partial setup corrupts local state | Rust transaction tests | Failure injection after each network/Keychain/filesystem step |
| Restart strands a deployment | Native persistence + mounted workflow | Redacted pending record, restart/update migration, explicit retention and abandonment |
| Deploy requires developer knowledge | Template contract + human walkthrough | Friendly prompts, no terminal, no raw JSON, no manual base URL |
| Existing users are broken | Migration and compatibility tests | Legacy token/config works; migration preserves data and can roll back |
| Test notification pollutes history | Runner integration tests | No occurrence/history record and isolated cleanup |
| UI works only in one screenshot | Browser renders + accessibility | Complete state set, desktop/narrow, zoom, keyboard, focus, contrast |
| Pulse leaks into Workshop | CSS/dependency boundary tests | Scoped selectors, no Workshop imports, generic commands only |
| Private fixture reaches public repo | Public-boundary lint | Accounts, topics, endpoints, paths, secrets, and real reminders rejected |
| Package cannot be pinned cleanly | Clean-consumer install | Exact Git revision installs and builds without pre-existing dependencies |

Coverage percentages remain supporting evidence, not the acceptance target.
Critical setup state, pairing/authentication, compensation, migration, and
secret-boundary branches require direct behavior tests even if aggregate line
coverage is already high.

Changed code may not reduce repository line or branch coverage. More
importantly, the critical setup-state, cryptographic verification,
authentication, native transaction, and migration modules require a named test
for every decision branch plus the targeted mutation checks specified in their
phases. A green percentage without those tests does not pass review.

## Review gates

### Product and function

- Does every supported setup, reconnect, repair, and abandonment path have a
  truthful consequence?
- Does the user always know which account owns the next action and any cost?
- Can normal setup finish without documentation or infrastructure vocabulary?
- Can a user without existing provider accounts recover from verification,
  permission, plan, and authorization blockers without losing progress?
- Are existing reminder and notification behaviors unchanged?
- Can the user recover without redeploying when only the phone or local
  connection is broken?

### Visual and interaction design

- Is the primary action obvious within five seconds?
- Does progress reflect real system state rather than optimistic theater?
- Are Workshop, browser, and phone handoffs unmistakable?
- Have unfamiliar nondevelopers completed the actual handoffs without observer
  translation or intervention?
- Does the layout use the Mac viewport intentionally while preserving readable
  line lengths?
- Are loading, waiting, failure, resume, repair, and completion designed as
  first-class states?
- Do controls, statuses, instructions, and external links look like what they
  are?
- Does the result remain coherent under host themes and standalone fallbacks?

### Production proof

- Do production screens match the approved hierarchy and copy?
- Are cloud and native responses real, bounded, and truthful?
- Are secrets absent at every forbidden boundary?
- Do clean installs, migration, restart, provider delay, and partial failures
  work?
- Have real renders and the cross-device handoff been inspected rather than
  inferred from component tests?

## Release acceptance checklist

The feature is complete only when all answers are yes:

1. Can a new user reach a confirmed Android test notification without terminal,
   docs, raw JSON, environment-variable knowledge, or manual Keychain work?
2. Does the user knowingly use only their own selected notification and runner
   provider accounts?
3. Can no user action create cost in an account owned by the Pulse maintainer?
4. Does the durable runner credential remain outside the Pulse webview?
5. Does the ntfy token remain outside Pulse and Workshop local state?
6. Does origin-bound proof prevent a pasted, redirected, downgraded, or relayed
   service from receiving setup authority or a durable credential?
7. Does a valid existing installation bypass setup and retain all private data?
8. Can another Mac receive its own credential without copying an existing one?
9. Are signup, verification, provider authorization, plan mismatch, Android
   permission, retry, abandonment, partial failure, repair, disconnect, and deletion
   consequences designed and tested?
10. Does the finished production UI pass the approved design, usability,
   accessibility,
   host-theme, and responsive evidence?
11. Do all Pulse and Workshop checks pass from clean revisions pinned together?

If any answer is no, the feature is not release-ready. "The docs explain it"
does not rescue a broken normal setup flow.

## Delivery and repository coordination

- Pulse and Workshop changes land in separate commits and remain independently
  reviewable.
- Cloud contracts and Pulse plugin support land before Workshop pins the new
  Pulse revision.
- Workshop's generic capability can land before Pulse uses it, but Pulse must
  detect capability availability and retain the current manual fallback until
  compatible Workshop releases are in use.
- Exact SHAs are recorded in the integration acceptance evidence.
- No provider deployment, production migration, release, or private-data write
  occurs merely because this plan exists; those actions require the relevant
  implementation phase and live verification.

## Product decisions locked by this plan

- Pulse depends on public notification and runner capability contracts, not
  provider brands.
- ntfy and Netlify are the first supported notification and quick-setup runner
  adapters; Netlify is replaceable without reopening the core product design.
- Every potentially paid service is owned and paid for by its user.
- Pulse does not become a hosted multi-tenant service.
- Pulse owns the setup UI; Workshop supplies generic native security only.
- Normal setup hides folders, JSON, environment-variable names, and Keychain
  mechanics.
- Provider actions remain explicit handoffs rather than fake automation.
- One-time, origin-bound native proof-of-possession pairing replaces durable
  API-token copying.
- Pending setup is native, resumable, migration-safe, and never silently
  destroys the key for a known deployment.
- Existing manual/self-hosted and legacy-token installations remain supported
  through this feature release.
- Design approval requires multiple directions, a complete state prototype,
  unfamiliar-user validation, and real production proof.
- Implementation and every defect fix follow test-first contracts.
