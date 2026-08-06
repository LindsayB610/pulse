# Local Demo Quickstart

Use the local demo to prove the public runner works before adding private
obligations or notification credentials.

## Setup

```sh
npm install
npm run build
```

## Single Run Smoke

Run one tick with the public sample config and console notifications:

```sh
PULSE_CONFIG_PATH=./pulses.example.yaml \
PULSE_STATE_PATH=/tmp/pulse-demo-state.json \
PULSE_RUNNER_MODE=demo \
PULSE_NOTIFY_PROVIDER=console \
node bin/pulse-runner.mjs
```

Expected result:

```json
{"scheduled":1,"becameDue":0,"notificationsSent":0}
```

Delete the temporary state file after the smoke run:

```sh
rm -f /tmp/pulse-demo-state.json
```

## Watch Mode

Watch mode runs continuously and checks on an interval:

```sh
PULSE_CONFIG_PATH=./pulses.example.yaml \
PULSE_STATE_PATH=/tmp/pulse-demo-state.json \
PULSE_RUNNER_MODE=demo \
PULSE_NOTIFY_PROVIDER=console \
PULSE_RUNNER_INTERVAL_MS=60000 \
node bin/pulse-runner.mjs --watch
```

Stop with `Ctrl-C`.

## Manage in Workshop

Pulse owns its management experience and can run inside Workshop as an optional
independently versioned plugin. Connect the Pulse plugin to
the private runner configuration after the runner contract is configured; do
not use a second Pulse-specific web interface.

## Next Step

Copy [../examples/forced-test-pulse.yaml](../examples/forced-test-pulse.yaml)
to a private path and follow [verify-runner.md](verify-runner.md) before using
real obligations.
