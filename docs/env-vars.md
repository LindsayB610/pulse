# Environment Variables

Pulse reads runner configuration from environment variables. Keep real values in
a private `.env` file or host secret store, never in git.

## Required

`PULSE_CONFIG_PATH`

Path to the private `pulses.yaml`.
For this setup, use `/Users/lindsaybrunner/Documents/workshop-private/pulse/pulses.yaml`.

`PULSE_STATE_PATH`

Path to the private JSON state file.
For this setup, use `/Users/lindsaybrunner/Documents/workshop-private/pulse/state.json`.

`PULSE_PRIVATE_ROOT`

Absolute private root that contains the production config and state paths. In
Docker, this is `/pulse/private`; on the Workshop computer, use
`/Users/lindsaybrunner/Documents/workshop-private/pulse`.

`PULSE_NOTIFY_PROVIDER`

Use `console` for local smoke tests or `ntfy` for Android push delivery.

`PULSE_RUNNER_MODE`

Use `demo` for the public local smoke test. Set `production` for an always-on
private runner; startup then validates the full production delivery contract.

## ntfy

`PULSE_NTFY_TOPIC`

The private ntfy topic subscribed to by the Android app. Production requires a
unique URL-safe value of at least 32 characters; do not commit it. A random
topic alone is not sufficient privacy protection.

`PULSE_NTFY_SERVER`

Required HTTPS ntfy server URL for production. Use `https://ntfy.sh` or a
self-hosted HTTPS server.

`PULSE_NTFY_TOKEN`

Required ntfy server access token. It is treated as a secret and redacted from
persisted notification details when passed through the runner env loader.

`PULSE_API_TOKEN`

A separate random private bearer token for Workshop's runner API. It must be
at least 32 characters and differ from `PULSE_NTFY_TOKEN`.

## Optional

`PULSE_RUNNER_INTERVAL_MS`

Polling interval for `node bin/pulse-runner.mjs --watch`. Defaults to `60000`.

`PULSE_RUNNER_HEALTH_PATH`

Optional private heartbeat file. Defaults to
`$PULSE_STATE_PATH.runner-health.json`. The runner refreshes it after each
successful tick; Workshop shows `running`, `stale`, or `unknown` from it.

`PULSE_RUNNER_TIMEZONE`

Optional operator hint for deployments. Pulse definitions still carry their own
schedule timezone.

`PULSE_API_HOST`

Host for `node bin/pulse-api.mjs`. Defaults to `127.0.0.1`.

`PULSE_API_PORT`

Port for `node bin/pulse-api.mjs`. Defaults to `8787`.

`PULSE_API_ALLOWED_ORIGINS`

Legacy browser-client allowlist. Leave this blank for the supported Workshop
native-proxy connection. It is not a substitute for the bearer token. The
Docker deployment binds the API to loopback only; use the documented SSH tunnel
rather than exposing this port publicly.
