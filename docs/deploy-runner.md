# Deploying a Pulse Runner

Normal users deploy from the guided setup inside Pulse in Workshop. The first
guided adapter uses Netlify, but Pulse’s contract is provider-neutral: the user
owns the account, quota, deployment, data, and bill.

## Guided Netlify deployment

1. In Pulse, finish the Android ntfy steps and choose **Quick setup with
   Netlify**.
2. Pulse opens Netlify’s repository template with four public values in the URL
   fragment: the setup public key, suggested private topic, ntfy server origin,
   and Workshop return value.
3. Sign in, choose the account/team that should own the deployment, name the
   site, and deploy.
4. Return the production `https://…netlify.app` origin to Workshop. Workshop
   verifies the exact origin, service/protocol versions, and deployment-key
   fingerprint before pairing.
5. Open the verified runner’s one-use credential page from Workshop and paste
   the ntfy token there. The runner stores it in its private site-scoped Blobs
   store; it is never entered into the deploy template or Pulse’s webview.
6. Send the isolated setup test and confirm Android receipt in Workshop.

The `pulse-runner` scheduled function runs every minute. Netlify Blobs holds
definitions, occurrence state, history, pairing state, hashed client
credentials, and runner-owned delivery material. Workshop holds only the
service origin and a Keychain reference; its per-Mac credential stays in
Keychain.

## Existing Netlify installation

Open **Pulse Settings → Move to managed access**. Workshop creates a public
`PULSE_SETUP_PUBLIC_KEY`. First update the existing deployment to the current
Pulse release. A site created through Deploy to Netlify normally owns a fork,
so sync that fork with the upstream Pulse repository before redeploying. Add the
public key to the existing site’s production environment, deploy the updated
code, then paste the existing site origin into Pulse.

This migration pairs Workshop to the same site. It does not replace reminders,
history, ntfy access, Blobs, or the old private-folder connection. The old
connection is left intact until the managed pairing succeeds.

## Compatible runner contract

Another provider or self-hosted runner must provide:

- public HTTPS with no redirect during setup or API calls;
- a stable canonical origin and a `pulse.setup.v1` manifest;
- origin-bound `pulse.setup.v1` challenge/pairing with Ed25519 proof;
- persistent private storage for reminders, state, history, client credential
  hashes, idempotency records, and delivery secrets;
- an always-on or scheduled execution mechanism;
- authenticated `/api/v1/*` reminder operations;
- isolated setup-test delivery;
- per-installation credentials, revocation, and ten-minute one-use invitations;
- runner-owned repair, export, update, and deletion instructions.

The exact endpoint and payload contract is documented in
[runner-setup-protocol.md](runner-setup-protocol.md). The deployment-adapter UI
contract is documented in [deployment-adapters.md](deployment-adapters.md).

## Ownership and deletion

Disconnecting Workshop revokes only that Mac. It does not stop the runner,
delete reminders, cancel provider billing, or remove the provider account.
Export anything needed, then delete the site from the provider dashboard to
stop its usage and billing.

The previous private-folder/env setup remains supported under **Advanced
setup** for recovery and self-hosting. See [private-config.md](private-config.md)
and [env-vars.md](env-vars.md).
