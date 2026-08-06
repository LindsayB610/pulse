# Deploy Runner

Pulse production for this release runs on Netlify scheduled functions with
private Netlify Blobs state. This is the only supported hosted model here.

## Configure Netlify

Create a Netlify site for this repository, then set these **function/runtime**
variables in the production context:

- `PULSE_NOTIFY_PROVIDER=ntfy`
- `PULSE_NTFY_SERVER=https://ntfy.sh`
- `PULSE_NTFY_TOPIC` and `PULSE_NTFY_TOKEN` as secrets
- `PULSE_API_TOKEN` as a separate secret
- `PULSE_NOTIFICATION_ACTION_SECRET` as a separate secret
- `PULSE_PUBLIC_BASE_URL` to the HTTPS Netlify site URL

Deploy with `netlify deploy --prod`. The `pulse-runner` scheduled function runs
every minute. Its private Blobs store holds definitions and occurrence state;
the public Git repository never receives real reminder definitions or tokens.

## Private plugin connection

Create a private Pulse folder outside both repositories with a
`pulse.config.json` based on
[../plugin/pulse.config.example.json](../plugin/pulse.config.example.json).
The credential reference resolves only inside Workshop’s future generic secure
service capability; the token is never exposed to Pulse’s webview.

## Verification

1. Create a forced test reminder through Pulse after the generic host
   capability is available.
2. Confirm the Netlify runner heartbeat is current.
3. Confirm ntfy receives a high-priority notification.
4. Tap Snooze, then Done, and confirm repeats stop.

## Success Checklist

- Netlify runner heartbeat is current.
- Private definitions and tokens are absent from the public repository.
- ntfy delivers Android Done and Snooze actions.
- A completed occurrence stops repeating.

The former VPS/Docker/SSH-tunnel instructions are intentionally retired from
the supported production path.
