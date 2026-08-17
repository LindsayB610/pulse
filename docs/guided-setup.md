# Guided Setup

Pulse’s normal setup lives inside the Pulse app in Workshop. It does not need a
terminal, a hand-written JSON file, a local folder path, or a copied runner API
token.

You need:

- Workshop on a Mac;
- an Android phone with the ntfy app;
- an ntfy account that can reserve a private authenticated topic; and
- an always-on runner in an account you own. The first guided runner adapter is
  Netlify.

Pulse does not operate shared notification or hosting accounts. You choose and
pay for any provider plan or usage. Pulse never purchases or upgrades a plan.

## The guided path

1. Open Pulse in Workshop and choose **Set up Pulse**.
2. Follow the four phone screens to sign into ntfy, reserve the generated
   private topic, subscribe Android with Instant delivery, and create a token
   named **Pulse runner**.
3. Choose **Quick setup with Netlify**. Netlify receives only public setup
   material in the client-side deployment URL fragment: the ephemeral public
   key, generated topic, notification-server origin, and Workshop return value.
   The ntfy token is never entered into Netlify’s template form.
4. Paste the production site address back into Workshop. Workshop verifies the
   exact HTTPS origin, runner identity, protocol versions, and deployment-key
   fingerprint before it signs the pairing challenge.
5. Workshop stores the returned per-Mac credential in Keychain without
   returning it to Pulse’s webview.
6. Choose **Open my secure runner page**. Paste the ntfy token only into that
   page on your verified runner. The page removes its one-use capability from
   the address bar immediately, exchanges it for a Secure, HttpOnly,
   SameSite=Strict cookie, stores the token in the runner’s private site-scoped
   store, never echoes it, and expires after ten minutes.
7. Send the isolated setup test. It creates no reminder, occurrence, history
   record, Done action, or Snooze action. Confirm receipt in Workshop, then
   create your first reminder.

Workshop restores an interrupted pre-pair setup from its native private record.
After pairing, Pulse checks the authenticated runner status and resumes at
notification delivery if the ntfy token has not been saved yet.

## Another Mac

On the new Mac, choose **Connect an existing Pulse** and copy its installation
id. On a connected Mac, open **Pulse Settings → Add another Mac**, paste that
id, and create the ten-minute invitation. Return the invitation and runner site
address to the new Mac. The invitation is origin-bound, installation-bound,
stored only as a hash, expires after ten minutes, and works once.

Each Mac receives a separate credential. Settings lists connected Macs and can
revoke one without breaking the others. The current Mac cannot revoke itself
from that list.

## Repair and ownership

Pulse Settings can send a clean test notification, reopen a fresh one-use
runner page to replace ntfy access, create another-Mac invitations, and revoke
old Mac credentials. Deleting or disconnecting Workshop does not delete the
remote runner, reminder data, or provider account. Export anything you need,
then delete the deployment from the provider dashboard when you want its usage
and billing to stop.

Before pairing, **Start over** requires confirmation and discards the saved
setup record and its one-time connection keys. It does not delete an ntfy or
provider account. If a runner was already deployed with the discarded public
key, that deployment will no longer pair and must be deleted or redeployed.
After pairing, Pulse removes this reset action and preserves the connected
runner while the user finishes notification delivery.

The old private-folder connection remains under **Advanced setup** for existing
manual and self-hosted installations. See [private-config.md](private-config.md)
and [deploy-runner.md](deploy-runner.md).

Moving an older hosted runner to managed access also requires updating that
deployment to the current Pulse release before adding the public setup key and
redeploying. This is explicit in the migration screen; Pulse does not pretend
an old runner already has endpoints that did not exist when it was deployed.
