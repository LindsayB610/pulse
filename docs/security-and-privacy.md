# Security And Privacy

The public repo gives you the Pulse engine. Your private runner deployment owns
your real obligations, credentials, and completion history.

Never commit:

- real `pulses.yaml`
- `.env`
- Twilio credentials
- phone numbers
- state files
- backups
- logs

Public examples should use fictional obligations only.

## Host Rules

- Keep `private/` readable only by the deploy user.
- Use a host secret store if your provider offers one.
- Rotate `PULSE_TWILIO_AUTH_TOKEN` if it appears in logs or shell history.
- Treat `state.json` as private because it contains completion history.
- Treat pulse titles as private if they reveal health, family, legal, financial,
  or other sensitive obligations.

## Logs

Pulse redacts configured secret env values before persisting notification
details, but operator logs may still reveal pulse titles and due times. Keep
runner logs private.

## Security Review Checklist

- Real `pulses.yaml` lives outside the public repo.
- `PULSE_TWILIO_AUTH_TOKEN` and other credentials are supplied by private env.
- `private/state.json` is backed up before upgrades.
- State imports are validated before replacing active state.
- The runner is reachable only by the operator or trusted private network.
- Done links or local UI access are not exposed publicly without authentication.
- Public examples use fictional obligations and fake phone numbers.
- `npm run lint` passes before release.

## Privacy Scanner Rules

The public boundary scanner checks committed examples and docs for private
looking obligations, personal names, real-looking local phone fragments, and
consumer email addresses. Keep the scanner conservative: a false positive is
better than leaking real obligations or recipient details.
