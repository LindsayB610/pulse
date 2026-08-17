# Runner Setup Protocol v1

A compatible runner exposes `pulse.setup.v1` over a stable public HTTPS origin.
Requests must not redirect. Bodies are bounded JSON. After pairing, protected
endpoints use `Authorization: Bearer <per-installation credential>`.

## First installation

1. `GET /api/setup/manifest` returns `service: "pulse-runner"`,
   `apiVersion: "pulse.service.v1"`, `setupVersion: "pulse.setup.v1"`, the
   canonical origin, setup state, deployed public-key fingerprint, and
   capabilities.
2. `POST /api/setup/challenge` with `{ installationId }` returns a two-minute
   `{ id, nonce, expiresAt }` challenge. A runner allows at most ten challenges
   per five-minute window.
3. Workshop signs this newline-delimited transcript with the ephemeral Ed25519
   private key that never leaves native storage:

   ```text
   pulse.setup.v1
   pulse.service.v1
   https://canonical-runner-origin.example
   challenge_id
   challenge_nonce
   installation_id
   DEPLOYED:PUBLIC:KEY:FINGERPRINT
   ```

4. `POST /api/setup/pair` supplies `{ apiVersion, challengeId,
   installationId, origin, signature }`. The runner permits five failed proofs,
   consumes the challenge once, retires first-installation bootstrap after
   success, returns a new client plus its credential once, and persists only a
   SHA-256 verifier.

Workshop verifies the manifest service/version/origin/fingerprint before
signing. It stores the returned credential directly in Keychain and writes only
the endpoint plus Keychain reference to app data. If local commit fails,
Workshop revokes the newly created runner client.

## Additional installations

- Authenticated `POST /api/setup/clients` with `{ installationId }` creates an
  origin- and installation-bound invitation. Store only its hash. It expires
  after ten minutes and works once.
- `POST /api/setup/additional-pair` with `{ code, installationId, origin }`
  returns that installation’s separate client and credential.
- Authenticated `GET /api/setup/clients` returns redacted client metadata and
  `currentClientId`.
- Authenticated `DELETE /api/setup/clients/:id` revokes one client. Workshop’s
  disconnect command identifies and revokes the authenticated current client
  before removing its local Keychain/config records.

## Delivery-secret handoff

- Authenticated `POST /api/setup/notification-session` returns a runner-owned
  URL with a ten-minute one-use capability in the fragment.
- The page removes the fragment immediately and exchanges the capability at
  `POST /api/setup/notification-exchange` for a ten-minute Secure, HttpOnly,
  SameSite=Strict cookie. It clears the capability from page memory afterward.
- `POST /api/setup/notification-secret` receives only the ntfy token in its
  JSON body and consumes the one-use session from that cookie.
- The runner stores only the capability hash in setup state and the delivery
  token in its provider-private secret store. It never echoes the token.
- Authenticated `GET /api/setup/status` reports only whether delivery is
  configured.

## Isolated proof

Authenticated `POST /api/setup/test-notification` accepts a bounded
`idempotencyKey`. The test is idempotent and creates no reminder, occurrence,
history entry, Done action, or Snooze action. Android receipt is confirmed by
the human in Workshop.

## Persistence and recovery

Setup state is versioned as `pulse.runner-setup.v1`. Raw credentials,
invitations, capabilities, and private keys are forbidden in it. Corrupt or
secret-bearing state fails closed and requires explicit restore/reset; it is
never silently replaced.
