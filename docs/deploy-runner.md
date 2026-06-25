# Deploy Runner

This guide deploys Pulse on a small always-on Linux VPS with Docker Compose.
Use any VPS provider you control. The public repo supplies the runner; your
server owns the private config, Twilio credentials, and state.

## Prerequisites

- A Linux VPS with Docker and Docker Compose installed.
- A Twilio SMS-capable sender number.
- A private destination phone number.
- A cloned Pulse repo on the server.

## Server Layout

Create a private folder next to the repo files:

```sh
mkdir -p private
chmod 700 private
```

Copy the sample config, then edit the day/time and title:

```sh
cp examples/forced-test-pulse.yaml private/pulses.yaml
```

Create `private/.env`:

```sh
PULSE_CONFIG_PATH=/pulse/private/pulses.yaml
PULSE_STATE_PATH=/pulse/private/state.json
PULSE_NOTIFICATION_CHANNEL=sms
PULSE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PULSE_TWILIO_AUTH_TOKEN=use-your-secret-store
PULSE_TWILIO_FROM=+15551234567
PULSE_SMS_TO=+15557654321
PULSE_RUNNER_INTERVAL_MS=60000
```

Lock down the env file:

```sh
chmod 600 private/.env private/pulses.yaml
```

## Deploy

Build and start the runner:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

Check logs:

```sh
docker compose -f deploy/docker-compose.yml logs -f pulse
```

The runner should print a JSON result on startup or continue quietly in watch
mode until a pulse becomes due.

## Forced Test Pulse

Before deploying real obligations, edit `private/pulses.yaml` so the forced test
pulse is due a few minutes from now:

- Set `daysOfWeek` to today.
- Set `time` to a near-future local time.
- Keep `channels: [sms]`.
- Keep `repeatEveryMinutes` low, such as `2`, only for this test.

Restart the runner after editing:

```sh
docker compose -f deploy/docker-compose.yml restart pulse
```

## Mark Done

After the forced test occurrence becomes due, mark it Done:

```sh
docker compose -f deploy/docker-compose.yml exec pulse \
  node bin/pulse-done.mjs --note "Verified deployment."
```

Watch the logs for at least one repeat interval after Done. No more
notifications should be sent for that occurrence.

## Success Checklist

- `private/pulses.yaml` exists on the server and is not committed.
- `private/.env` exists on the server and is not committed.
- `docker compose -f deploy/docker-compose.yml up -d --build` succeeds.
- `docker compose -f deploy/docker-compose.yml logs pulse` shows runner output.
- `private/state.json` is created.
- Confirm a Twilio SMS arrives for the forced test pulse.
- Confirm repeat SMS sends while the occurrence remains due.
- Confirm `pulse-done` marks the due occurrence Done.
- Confirm notifications stop after Done.
- Replace the forced test pulse with real private pulses only after the checklist passes.
