# Private Config

Pulse separates public engine code from private runner data. For this release,
the hosted Netlify runner is authoritative; a local `pulses.yaml` is a private
backup/export, not a transactionally synchronized second source of truth.

Public files:

- `.env.example`
- `pulses.example.yaml`
- demo docs
- tests

For this Workshop computer, keep private Pulse data here, outside both public
repositories:

```text
/Users/lindsaybrunner/Documents/workshop-private/pulse/
  .env
  pulses.yaml
  state.json
  backups/
  pulse.config.json
```

Private files:

- `.env`
- `pulses.yaml`
- state files
- backups
- logs

Keep private files outside git. A real deployment should pass private paths with
environment variables such as `PULSE_CONFIG_PATH` and `PULSE_STATE_PATH`.
See [env-vars.md](env-vars.md) for the full environment contract.

On another host, choose an absolute private root outside that host's public
Pulse checkout (for example, `/srv/pulse-private`). The directory layout stays
the same; only the absolute host path changes.

The production contract requires authenticated ntfy delivery and a separate
runner API token. A random topic alone is not treated as private. The ntfy
server must enforce access control for its token, whether it is `ntfy.sh` or a
self-hosted HTTPS server.

Example private runner environment:

```sh
PULSE_CONFIG_PATH=/Users/lindsaybrunner/Documents/workshop-private/pulse/pulses.yaml
PULSE_STATE_PATH=/Users/lindsaybrunner/Documents/workshop-private/pulse/state.json
PULSE_PRIVATE_ROOT=/Users/lindsaybrunner/Documents/workshop-private/pulse
PULSE_RUNNER_MODE=production
PULSE_NOTIFY_PROVIDER=ntfy
PULSE_NTFY_SERVER=https://ntfy.sh
PULSE_NTFY_TOPIC=
PULSE_NTFY_TOKEN=
PULSE_API_TOKEN=
```

Set the three blank secret values only in this private file or your host's
secret store; do not paste them into public documentation.

The public repo includes `pulses.example.yaml` only as a safe fixture. Copy it to
a private path before adding real obligations.

## Workshop Secure-Service Connection

Workshop never receives the runner API token in its webview. Its Pulse plugin
reads only this metadata file from the private folder:

```json
{
  "version": 1,
  "endpoint": "https://your-private-pulse-service.example",
  "credentialRef": "pulse-api-token"
}
```

`endpoint` must be the HTTPS origin of the private Pulse API, with no path.
`credentialRef` is a name, not a token. Store the matching token in the local
macOS Keychain using Workshop's generic secure-service credential store; the
Workshop host adds it to API requests and keeps it out of Pulse's UI.

In Workshop, open Pulse, enter the absolute private folder path, and click
**Connect Pulse**. Pulse loads existing reminders automatically and lets you
create or manage them from that same view. The private folder is selected once
per Workshop installation; it does not belong in the public Pulse repository.

## Private Pulse Config

Start from [../examples/forced-test-pulse.yaml](../examples/forced-test-pulse.yaml)
or [../pulses.example.yaml](../pulses.example.yaml). Keep the private copy at a
path like `/Users/lindsaybrunner/Documents/workshop-private/pulse/pulses.yaml`.

Do not commit:

- real pulse titles
- real schedules
- phone numbers
- ntfy topic and required access token
- runner API token
- `state.json`
- backups
