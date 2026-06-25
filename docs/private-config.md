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
See [env-vars.md](env-vars.md) for the full environment contract.

Example private runner environment:

```sh
PULSE_CONFIG_PATH=/srv/pulse/private/pulses.yaml
PULSE_STATE_PATH=/srv/pulse/private/state.json
PULSE_NOTIFICATION_CHANNEL=sms
PULSE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PULSE_TWILIO_AUTH_TOKEN=use-your-secret-store
PULSE_TWILIO_FROM=+15551234567
PULSE_SMS_TO=+15557654321
```

The public repo includes `pulses.example.yaml` only as a safe fixture. Copy it to
a private path before adding real obligations.

## Private Pulse Config

Start from [../examples/forced-test-pulse.yaml](../examples/forced-test-pulse.yaml)
or [../pulses.example.yaml](../pulses.example.yaml). Keep the private copy at a
path like `/srv/pulse/private/pulses.yaml`.

Do not commit:

- real pulse titles
- real schedules
- phone numbers
- Twilio credentials
- `state.json`
- backups
