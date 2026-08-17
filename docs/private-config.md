# Advanced Private Configuration

The normal guided setup does not ask for a folder, JSON file, runner API token,
or direct Keychain work. This document describes the previous manual connection
and local-file runner used for development, recovery, and advanced self-hosting.

Keep private data outside every public repository, for example:

```text
/absolute/private/pulse/
  .env
  pulses.yaml
  state.json
  backups/
  pulse.config.json
```

Never commit real reminder titles, schedules, `.env`, state, history, backups,
logs, ntfy topics/tokens, runner credentials, or `pulse.config.json`.

## Manual Workshop connection

The Advanced setup screen accepts a private directory containing:

```json
{
  "version": 1,
  "endpoint": "https://your-private-pulse-service.example",
  "credentialRef": "pulse-api-token"
}
```

`endpoint` must be the HTTPS origin with no path. `credentialRef` is a name,
not a secret. Store its matching value in Workshop’s generic macOS Keychain
service. Workshop adds it to constrained requests natively; Pulse’s webview
never receives it.

The selected folder remains local to that Workshop installation. **Change
folder** changes only this local connection. It does not move or synchronize
runner data.

## Local-file runner

Copy [../pulses.example.yaml](../pulses.example.yaml) to the private directory
before adding real obligations. Point `PULSE_CONFIG_PATH`, `PULSE_STATE_PATH`,
and `PULSE_PRIVATE_ROOT` at those private files. The hosted runner remains the
production source of truth unless you deliberately operate this local model.

## Move an old installation to managed access

Use **Pulse Settings → Move to managed access**. Add the public setup key to the
existing deployment and pair the same origin. Pulse preserves the old manual
folder and remote data until managed pairing succeeds; successful migration
then removes only Workshop’s obsolete folder selection.
