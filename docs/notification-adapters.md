# Notification Adapters

Pulse notification adapters are delivery mechanisms. The durable obligation
state remains the product.

Current adapters are `console` for local demos/tests and authenticated `ntfy`
for production Android push.

## ntfy Android Push

The runner POSTs one notification per due occurrence to the configured private
topic. The title identifies the due pulse, and every live notification includes
**Done** and **Snooze 30 min** Android actions. Done acknowledges that exact
occurrence, clears the notification, and stops later repeats. Snooze moves the
same occurrence forward thirty minutes; it remains active until Done. Neither
action requires an Android phone. Pulse is where pulses are created,
paused, resumed, and deleted. ntfy payloads use high priority and the `bell`
tag. A failed send is recorded and retried by the normal occurrence repeat
policy.

Adapters must not log secrets.

## Console

The console adapter writes a one-line pulse notification for local smoke tests
and simple process logs.

Use it with:

```sh
PULSE_NOTIFY_PROVIDER=console
```

Install the ntfy Android app, create or choose a unique URL-safe topic of at
least 32 characters, and subscribe your phone to it. Configure the private
cloud runner with:

```sh
PULSE_NOTIFY_PROVIDER=ntfy
PULSE_NTFY_SERVER=https://ntfy.sh
PULSE_NTFY_TOPIC=
PULSE_NTFY_TOKEN=
```

Set those blank values only in the runner's private environment. Production
requires an ntfy access token; an opaque topic alone is not access control.

Topics and tokens are private and are redacted from persisted notification
details. The live Android check is part of the deployment verification in
[deploy-runner.md](deploy-runner.md).
