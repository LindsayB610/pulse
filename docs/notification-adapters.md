# Notification Adapters

Pulse notification adapters are delivery mechanisms. The durable obligation
state remains the product.

Current adapters are `console` for local demos/tests and authenticated `ntfy`
for production Android push.

## ntfy Android Push

The runner assigns each occurrence an opaque ntfy sequence and POSTs every
initial or snoozed notification in that occurrence to the same sequence. This
keeps one reminder chain together without exposing the pulse name or schedule in
the sequence ID. The title identifies the due pulse, and every live notification includes
**Done** and a duration-aware **Snooze** Android action. Done acknowledges that exact
occurrence, deletes that occurrence's ntfy sequence, and stops later repeats.
It does not delete the saved Pulse definition, future recurring occurrences, or
notifications from any other occurrence. Snooze moves the
same occurrence forward by that pulse's configured duration; it remains active until Done. Neither
action requires an Android phone. Pulse is where pulses are created,
paused, resumed, and deleted. ntfy payloads use high priority and the `bell`
tag. A failed send is recorded and retried by the normal occurrence repeat
policy.

Pulse records sequence cleanup separately from completion. If ntfy is
temporarily unavailable, Done still succeeds and remains durable; the scheduled
runner retries deletion after five minutes. Notifications sent by Pulse versions
before sequence support cannot be grouped safely and must be removed manually.
Pulse never guesses which legacy messages belong together.

Adapters must not log secrets.

`notificationPolicy.snoozeEveryMinutes` controls both the Android Snooze action
and what happens when an alert is unanswered for two minutes. It defaults to
`30`; use `1440` for a daily follow-up. The action label is rendered from the
actual value, for example **Snooze 1 day**.

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
