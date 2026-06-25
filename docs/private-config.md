# Private Config

Pulse separates public engine code from private runner data.

Public files:

- `.env.example`
- `pulses.example.yaml`
- demo docs
- tests

Private files:

- `.env`
- `pulses.yaml`
- state files
- backups
- logs

Keep private files outside git. A real deployment should pass private paths with
environment variables such as `PULSE_CONFIG_PATH` and `PULSE_STATE_PATH`.

Example private runner environment:

```sh
PULSE_CONFIG_PATH=/srv/pulse/private/pulses.yaml
PULSE_STATE_PATH=/srv/pulse/private/state.json
PULSE_EMAIL_SMTP_PASSWORD=use-your-secret-store
PULSE_EMAIL_TO=you@example.com
```

The public repo includes `pulses.example.yaml` only as a safe fixture. Copy it to
a private path before adding real obligations.
