# Notification Adapters

Pulse notification adapters are delivery mechanisms. The durable obligation
state remains the product.

Supported adapters:

- console for local demo and tests
- Twilio SMS for practical phone delivery

Adapters must not log secrets.

## Console

The console adapter writes a one-line pulse notification for local smoke tests
and simple process logs.

Use it with:

```sh
PULSE_NOTIFICATION_CHANNEL=console
```

## Twilio SMS

The SMS adapter sends a text message through Twilio's Messages API. Configure
credentials and phone numbers privately:

```sh
PULSE_NOTIFICATION_CHANNEL=sms
PULSE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PULSE_TWILIO_AUTH_TOKEN=use-your-secret-store
PULSE_TWILIO_FROM=+15551234567
PULSE_SMS_TO=+15557654321
```

The runner posts a form-encoded message payload with `From`, `To`, and `Body`
to Twilio. Adapter failures are recorded in Pulse state so the repeat policy
can retry them, but known secret env values are redacted before notification
details are persisted.
