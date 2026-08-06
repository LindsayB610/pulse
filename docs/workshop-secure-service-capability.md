# Generic Secure Service Capability Proposal

Pulse is an optional Workshop plugin. It needs a host capability that reads a
plugin-owned non-secret connection configuration from the selected private
root, then makes a constrained authenticated request without returning the
credential to the plugin webview.

## Proposed types

```ts
type SecureServiceMetadata = { version: 1; endpoint: string; credentialRef: string };
type SecureServiceRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; body?: unknown };
type SecureServiceResponse = { status: number; body: unknown };
```

`read_secure_service_metadata(root, "pulse.config.json")` returns only
validated endpoint metadata. `request_configured_secure_service(root, request)`
loads the referenced OS-keychain credential internally and returns status/body,
never the token.

## Validation and limits

- selected root must be absolute, regular, and outside public repositories;
- config is JSON, version `1`, with an HTTPS endpoint; localhost HTTP is an
  explicit development-only exception;
- request paths are relative, start with `/api/`, contain no origin, query, or
  traversal; methods are the four listed above;
- JSON bodies are at most 64 KiB; no plugin authorization headers are accepted;
- host pins requests to the configured origin, uses a 15-second timeout, and
  returns a bounded parsed JSON/error body without logging credentials;
- capability state, errors, markup, and serialized plugin data never contain
  the credential or its value.

## Expected host tests

1. Reject relative, symlinked, public-repository, and malformed roots.
2. Reject unsafe endpoints, origins, methods, paths, bodies, and headers.
3. Prove the token cannot appear in metadata, response, logs, errors, or saved
   state.
4. Prove the configured origin and credential reference are the only ones used.
5. Prove localhost development support is explicit and unavailable in production.

## Workshop handoff request

Please implement `read_secure_service_metadata` and
`request_configured_secure_service` as generic host capabilities, with the
validation and regression tests above. Pulse will then pin the Workshop
revision and wire its planned plugin view to those capabilities.
