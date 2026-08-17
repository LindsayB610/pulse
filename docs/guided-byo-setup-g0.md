# Guided BYO Setup: G0 Decision Record

**Status:** Complete for contract and provider research. The current production
setup remains unchanged. This record governs the G1 prototype and future G2–G8
implementation.

## Decision

Pulse will keep a provider-neutral setup and pairing model. Netlify remains the
first candidate quick-setup runner adapter and ntfy remains the first
notification adapter, but neither provider appears in the core setup state
machine or Workshop capability.

The original idea of collecting the ntfy token during the Deploy to Netlify
template form does not pass the approved secret boundary. **Template-time ntfy
token entry is rejected.** Netlify template values are stored as environment
variables with default access to every scope and deploy context, while the
template surface cannot prove production-Functions-only scope and secret
marking before the first build.

The safer first-adapter design is:

1. deploy the runner with only the ephemeral public key, generated private
   topic, and notification server;
2. verify the deployed origin and pair the Mac through Workshop's native,
   origin-bound proof;
3. ask Workshop's native service to open a short-lived, single-use,
   runner-owned secure setup page in the system browser;
4. enter the ntfy token directly on that user-owned runner origin;
5. store the token in the runner provider's approved encrypted private store;
6. return only a redacted delivery-ready status to Pulse; and
7. send and confirm the isolated test notification.

For Netlify, the candidate private store is a dedicated site-scoped Blobs
record. Netlify documents that Blobs may contain sensitive data and are
encrypted at rest and in transit. Access is limited to the user's own site,
subject to the code the owner deploys. The implementation must use a fixed
non-user-controlled key, production-only endpoint guards, a single-purpose
short-lived browser session, no arbitrary-key API, no token echo, and public
artifact/log scans.

This moves credential capture out of the build and out of both desktop
webviews. The Pulse webview never observes the notification credential.
Workshop never observes it in JavaScript or local state. The Netlify build never observes it.
The user's browser on the verified runner origin and the runner's production runtime necessarily do.

## Verified provider behavior

Research was checked against official documentation on August 15, 2026.
Provider behavior remains a release-time smoke-test requirement.

### Netlify deploy handoff

The official
[Deploy to Netlify documentation](https://docs.netlify.com/deploy/create-deploys/)
supports template environment prompts and client-side URL-fragment values. A
URL fragment is suitable for the ephemeral public key, private topic, and
default server because those values are not durable credentials and the
fragment is processed client-side rather than sent in the HTTP request.

The same surface is not accepted for the ntfy token. Netlify's
[environment-variable overview](https://docs.netlify.com/build/environment-variables/overview/)
states that variables default to all scopes and deploy contexts. The Netlify UI
and API can later narrow scopes, and the Secrets Controller can make values
write-only, but the template handoff itself does not establish those
properties before the first build.

Netlify documents a default approval policy for untrusted public-repository
deploys and masking of detected sensitive values. Those are useful defense in
depth; they do not justify making a long-lived, full-account ntfy token
available to a build that does not need it.

### Netlify private storage

The official
[Netlify Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
states that:

- Blobs are encrypted at rest and in transit;
- sensitive data may be stored there;
- a Blob belongs to one site;
- site-wide stores persist across deploys; and
- the application remains responsible for preventing its access code from
  leaking data.

This satisfies the storage baseline for a user-owned personal runner, with two
important limits locked into the threat model:

- code and build plugins deployed in the user's site can access site Blobs, so
  dependencies and deploy revisions must be pinned, scanned, and reviewable;
- Blobs do not provide compare-and-swap locking, so occurrence, rate-limit,
  pairing, and secret-session records require the existing explicit
  locking/atomicity layer and concurrency tests.

### ntfy account, topic, token, and Android behavior

The official [ntfy configuration documentation](https://docs.ntfy.sh/config/)
confirms that topic reservations depend on server configuration and the user's
tier. Pulse therefore cannot promise that every ntfy account can protect a
topic, and it must not silently downgrade to an unprotected random topic.

The same documentation says access tokens currently grant almost the entire
account rather than a topic-limited permission. That makes the token a
high-impact secret and is the reason build-time entry is rejected.

The official [ntfy publishing documentation](https://docs.ntfy.sh/publish/)
confirms that a signed-in user can create an access token in the web account
and use it for authenticated publishing.

The official
[Android subscription documentation](https://docs.ntfy.sh/subscribe/phone/)
states that instant delivery is required to avoid potentially long delays,
uses a foreground service, and behaves differently for the Google Play and
F-Droid builds. Pulse can guide the setting but cannot infer that the phone
received a notification. Human confirmation remains part of setup.

## Current journey baseline

The checked-in current setup requires fifteen user actions before a real
delivery proof:

1. create an ntfy account;
2. find a tier/server that permits a protected topic;
3. reserve the topic;
4. subscribe the Android app;
5. grant permission and configure timely delivery;
6. create an account-wide ntfy token;
7. create a Netlify project;
8. generate separate runner and notification-action secrets;
9. configure production runner variables;
10. deploy and inspect the scheduled function;
11. create a private folder outside the public repositories;
12. write `pulse.config.json`;
13. put the matching runner credential in Keychain;
14. paste the absolute folder path into Pulse; and
15. create and manually verify a harmless reminder.

The current UI begins at step 14. That is why it feels like developer plumbing:
it is developer plumbing.

The target journey has seven understandable jobs: ownership, phone, runner,
pairing, secure delivery configuration, proof, first reminder. Provider signup
and deployment wait time remain external, but every return is resumable.

The machine-readable baseline and target transcripts live in
`test/fixtures/guided-setup/contracts-v1.json`.

## Provider-neutral capability lock

Core setup knows only these runner capabilities:

- stable canonical HTTPS origin;
- private durable storage with locking/atomicity;
- reliable scheduling;
- fixed manifest and compatible API versions;
- origin-bound challenge/proof pairing;
- per-installation credentials;
- private notification-secret capture;
- isolated test notification;
- health, management, repair, update, export, and deletion.

A quick-setup adapter supplies provider-owned handoff URLs/actions, return
mechanics, secret-storage evidence, runtime origin metadata, cost disclosure,
and lifecycle links. A fictional second adapter in the G0 fixture uses exactly
the same contract. If core setup code needs a Netlify branch, the boundary has
failed.

## Native boundary lock

Workshop remains generic. The native host may:

- begin, resume, cancel, and migrate a pending secure-service setup;
- generate and retain an ephemeral keypair;
- return public setup material and redacted progress;
- validate an origin, manifest, fingerprint, challenge, and API version;
- sign the canonical origin-bound transcript without returning the private key;
- receive and store a durable client credential without returning it;
- write the managed service metadata atomically;
- request and open a short-lived setup handoff pinned to the configured origin;
  and
- request the connected service through the existing constrained requester.

Workshop may not contain ntfy, Netlify, reminder, or Pulse UI logic. Pulse still
passes `configFile: "pulse.config.json"`.

## Secret-flow lock

| Value | May observe | Must never observe |
| --- | --- | --- |
| Ephemeral private key | Workshop native Keychain and signer | Pulse, Workshop JavaScript, runner, provider, files, logs |
| Ephemeral public key/fingerprint | Native host, Pulse, deployment handoff, runner | No secrecy requirement |
| Durable client credential | Runner issuance response in flight, Workshop native service, macOS Keychain | Pulse, Workshop JavaScript, config, runner storage in recoverable form, logs |
| ntfy token | User, ntfy, system browser on verified runner origin, runner production runtime, provider-encrypted private store | Pulse, Workshop, deploy URL/form, build, repository, logs |
| Private topic | User, phone, native pending record/redacted setup, runner | Public repository, public fixture, logs |
| Browser setup capability | Workshop native service, system browser, verified runner origin | Pulse, local/session storage, URL query, logs, other origins |

The browser setup capability is single-use, expires after ten minutes, is
created only after origin-bound pairing, is opened by Workshop natively, and is
placed in the URL fragment or an equivalent non-log transport. The runner
exchanges it immediately for an HttpOnly, SameSite=Strict, origin-bound setup
session before rendering the credential form.

## Pairing and threat model

| Threat | Required control | Expected result |
| --- | --- | --- |
| Pasted malicious origin | Match deployed fingerprint before signing | No proof or credential sent |
| Redirect to another host | Reject every redirect | Fail closed |
| Challenge relay | Signature covers canonical origin, challenge, installation, fingerprint, and version | Relayed proof is invalid |
| Replay | Shared, atomic, short-lived challenge consumption | Second use rejected |
| API downgrade | Exact supported setup/API version match | Pairing rejected before storage |
| Brute force | Shared provider-backed attempt limits and uniform errors | Bounded, non-enumerating failure |
| Partial local write | Pair, Keychain, config transaction with compensating revocation | Existing connection stays usable |
| Abandoned deployment | Retain matching pending private key; explain remote ownership and deletion | Resume without redeploy |
| Token in build/template | Post-pair runner-owned browser capture | Build and deploy handoff never receive token |
| Token echoed or logged | Write-only endpoint response, redaction, artifact/log tests | No recoverable copy outside approved store |
| Blob arbitrary read | Fixed internal key and no caller-selected store/key | Remote caller cannot fetch secret |
| Compromised deploy dependency | Pinned lockfile, public revision, dependency and artifact scans | Risk reduced and auditable |
| Phone permission denied | Honest diagnostic; no fake receipt state | Setup remains incomplete and resumable |

The canonical accept/reject transcripts are fixtures, not executable
cryptography. G2 turns them into real cryptographic tests before endpoint code.

## Return and resume decision

A provider success link may make the candidate runner URL convenient, but it
does not prove ownership. Every path uses the same fingerprint and
origin-bound native pairing.

The fallback asks for a normal site address, not an API endpoint. Workshop
normalizes it, rejects credentials/fragments/paths, fetches the fixed manifest,
and pins all later setup calls to that origin.

The native pending record remains the source of truth across browser handoffs,
Workshop restart, network loss, and provider delay. A deployment-known session
is never deleted automatically because its private key is required to resume.

## G0 gate result

- Provider-neutral contracts: **pass**
- Netlify template for non-secret public setup values: **pass**
- Netlify template-time ntfy token: **fail; rejected**
- Post-pair runner-owned secret capture backed by encrypted provider storage:
  **approved for G1 prototype; requires G3 implementation/security proof**
- ntfy account/topic/token/Android behavior: **verified enough for prototype;
  live release smoke test still required**
- Origin-bound pairing and native redaction boundary: **locked as test
  contracts**
- Current-installation migration and rollback: **locked**

The only user-visible change from the earlier plan is beneficial but real:
instead of pasting the ntfy token into a dense Netlify deployment form, the
user pastes it into a one-job secure page on their own runner after the runner
has been cryptographically verified. G1 presents that sequence explicitly so
the product owner can judge it with the full interaction design.
