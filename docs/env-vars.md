# Environment Variables

Pulse reads runner configuration from environment variables. Keep real values in
a private `.env` file or host secret store, never in git.

## Required

`PULSE_CONFIG_PATH`

Path to the private `pulses.yaml`.

`PULSE_STATE_PATH`

Path to the private JSON state file.

`PULSE_NOTIFICATION_CHANNEL`

Use `console` for local smoke tests or `sms` for Twilio SMS.

## Twilio SMS

`PULSE_TWILIO_ACCOUNT_SID`

Twilio account SID.

`PULSE_TWILIO_AUTH_TOKEN`

Twilio auth token. This is treated as a secret and is redacted from persisted
notification details when passed through the runner env loader.

`PULSE_TWILIO_FROM`

The Twilio sender phone number in E.164 format.

`PULSE_SMS_TO`

The destination phone number in E.164 format.

## Optional

`PULSE_RUNNER_INTERVAL_MS`

Polling interval for `node bin/pulse-runner.mjs --watch`. Defaults to `60000`.

`PULSE_RUNNER_TIMEZONE`

Optional operator hint for deployments. Pulse definitions still carry their own
schedule timezone.

`PULSE_UI_HOST`

Host for `node bin/pulse-ui.mjs`. Defaults to `127.0.0.1`.

`PULSE_UI_PORT`

Port for `node bin/pulse-ui.mjs`. Defaults to `8787`.
