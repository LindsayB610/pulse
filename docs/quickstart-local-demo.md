# Local Demo Quickstart

Use the local demo to prove the public runner works before adding private
obligations or Twilio credentials.

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
PULSE_NOTIFICATION_CHANNEL=console \
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
PULSE_NOTIFICATION_CHANNEL=console \
PULSE_RUNNER_INTERVAL_MS=60000 \
node bin/pulse-runner.mjs --watch
```

Stop with `Ctrl-C`.

## Local Management UI

Build first, then start the local UI against the same config and state file:

```sh
PULSE_CONFIG_PATH=./pulses.example.yaml \
PULSE_STATE_PATH=/tmp/pulse-demo-state.json \
node bin/pulse-ui.mjs
```

Open <http://127.0.0.1:8787/>. The UI shows due, upcoming, and completed
occurrences from the state file. Due occurrences can be marked Done with an
optional completion note.

## Next Step

Copy [../examples/forced-test-pulse.yaml](../examples/forced-test-pulse.yaml)
to a private path and follow [verify-runner.md](verify-runner.md) before using
real obligations.
