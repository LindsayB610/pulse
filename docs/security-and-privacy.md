# Security and Privacy

The public repository supplies software. Each user’s runner owns their real
reminders, state, history, notification access, and operating cost.

## Trust boundaries

- Pulse’s webview receives public setup material and redacted status only.
- Workshop native storage owns the ephemeral setup private key before pairing.
- macOS Keychain owns each installation’s separate runner credential.
- The runner stores credential, invitation, and one-use-capability verifiers as
  hashes, not recoverable values.
- The runner’s provider-private store owns the ntfy token and generated action
  signing material.
- Netlify’s deploy template receives only a public setup key, topic, ntfy
  origin, and return value. No credentials enter template URLs or build logs.

Workshop pins secure requests to the validated HTTPS origin, rejects unsafe or
private network targets, disallows redirects, limits methods/paths/body sizes
and timeouts, injects credentials outside the webview, and redacts credentials
from responses.

## Never commit or publish

- real reminder titles or schedules;
- ntfy topics or tokens;
- runner/client credentials;
- `.env`, `pulse.config.json`, state, history, backups, or logs;
- provider/account identifiers or local personal paths.

Topics and reminder titles can reveal health, family, legal, or financial
information. Treat them as private even when they are not authentication.

## Setup security

- first-installation challenges expire after two minutes, are rate-limited,
  allow five failed proofs, and are consumed once;
- the pairing transcript binds protocol versions, exact origin, challenge,
  installation id, and deployed-key fingerprint;
- first-installation bootstrap retires after success;
- additional-Mac invitations and delivery-secret sessions expire after ten
  minutes, are origin-bound, stored only as hashes, and work once;
- the runner-owned secret page removes its fragment immediately and never
  echoes a saved token;
- corrupt or secret-bearing setup state fails closed;
- local pairing failure triggers remote client revocation and Keychain cleanup.

## Logs and operations

Pulse redacts configured secrets from persisted notification details, but
private logs can still reveal titles and due times. Keep provider logs private.
Rotate any credential that appears in logs, screenshots, shell history, or a
public issue.

Disconnecting Workshop revokes one Mac. It does not delete the runner, cancel
provider billing, or remove reminders. Delete the deployment in the owner’s
provider account when the service should stop.

Run `npm run lint` before release. The public-boundary scanner rejects private-
looking data in public examples and documentation.
