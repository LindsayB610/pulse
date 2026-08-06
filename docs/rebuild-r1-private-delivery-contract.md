# Pulse Rebuild R1 — Private Delivery Contract (Historical)

> Superseded for this release by the Netlify hosted-runner authoritative model
> and [generic secure-service capability proposal](workshop-secure-service-capability.md).

Status: **implemented; awaiting owner review and acceptance.**

## Private root

Pulse's real configuration and state live in one absolute private root outside
the public Pulse and Workshop repositories. On this Workshop computer, that
root is:

```text
/Users/lindsaybrunner/Documents/workshop-private/pulse/
  .env
  pulses.yaml
  state.json
  backups/
```

The public repositories contain only examples, code, and documentation. They
must never contain the real files above. A deployed host uses the same layout
at its own absolute external root, such as `/srv/pulse-private`; Docker Compose
receives that path through `PULSE_PRIVATE_ROOT`. Run Compose only through
`node bin/pulse-compose.mjs`, which rejects a missing, relative, in-checkout,
or whitespace-padded private root before Docker is invoked.

## Production delivery environment

A production runner must supply these values through its host secret store or
the private `.env` file:

| Variable | Contract |
| --- | --- |
| `PULSE_CONFIG_PATH` | Absolute path to private `pulses.yaml`. |
| `PULSE_STATE_PATH` | Absolute path to private `state.json`. |
| `PULSE_NOTIFY_PROVIDER` | Exactly `ntfy`. `console` remains local-demo only. |
| `PULSE_NTFY_SERVER` | HTTPS ntfy server, either `https://ntfy.sh` or self-hosted. |
| `PULSE_RUNNER_MODE` | Exactly `production`; runner startup validates this contract. |
| `PULSE_NTFY_TOPIC` | Unique URL-safe topic of at least 32 characters. Never commit it. |
| `PULSE_NTFY_TOKEN` | Required ntfy access token. The configured server must enforce access control for it. |
| `PULSE_API_TOKEN` | Separate random bearer token of at least 32 characters for a future private runner API. |

`PULSE_NTFY_TOKEN` and `PULSE_API_TOKEN` must have different values. Pulse
treats both as secrets for configuration handling and redaction. A random topic
is an identifier, not an access-control mechanism.

## Threat model and delivery decisions

- The ntfy topic, title/body, completion history, config, state, and both
  tokens are private data.
- The runner API is deployed on VPS loopback only and reached from Workshop
  through an SSH tunnel. If a desktop webview needs CORS, use exact configured
  origins; never use a wildcard.
- Workshop retains the API token only in current-session component memory. It
  is never placed in a repository, analytics, or ordinary synced workspace
  state.
- ntfy sends a high-priority `bell` notification whose title/body identify the
  due obligation. Runner repeat policy retries while the occurrence is due;
  Done ends the repeat loop.

## Verification

Production runner startup calls `validatePrivateDeliveryEnv`. Tests cover a
rejected invalid runner environment and an accepted complete one, plus missing
or relative paths, a non-ntfy provider, malformed/non-HTTPS server, weak topic,
missing ntfy token, short API token, and duplicate tokens. The public-boundary
lint recursively scans public Markdown/YAML/example-env files and rejects
nonblank ntfy topic/token assignments or tracked files under private/state
directories. Tests also prove Compose preflight rejects relative and
in-checkout private roots, production uses an external config fixture, and
failure details redact both ntfy tokens and topics.
