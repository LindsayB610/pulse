# Workshop Generic Secure Service Capability

Pulse is an optional Workshop plugin. It uses a host capability that reads a
plugin-owned non-secret connection configuration from the selected private
root, then makes a constrained authenticated request without returning the
credential to the plugin webview.

## Host contract

```ts
type SecureServiceMetadata = { version: 1; endpoint: string; credentialRef: string };
type SecureServiceRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; body?: unknown };
type SecureServiceResponse = { status: number; body: unknown };
```

`read_secure_service_metadata({ workspaceRoot, configFile })` returns only
validated endpoint metadata. `request_configured_secure_service({
workspaceRoot, configFile, request })` loads the referenced OS-keychain
credential internally and returns status/body, never the token.

Pulse always passes `configFile: "pulse.config.json"`. Its `WorkshopToolView`
first reads the metadata, then constructs its requester from the configured
service command. It retains no bearer token, authorization header, or secret in
the webview.

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

## Required host guarantees

1. Reject relative, symlinked, public-repository, and malformed roots.
2. Reject unsafe endpoints, origins, methods, paths, bodies, and headers.
3. Prove the token cannot appear in metadata, response, logs, errors, or saved
   state.
4. Prove the configured origin and credential reference are the only ones used.
5. Prove localhost development support is explicit and unavailable in production.

## Pulse integration evidence

- Pulse's package test proves it calls both generic commands with the fixed
  config file and that request data contains no credential.
- A mounted component test creates a configured reminder through the generic
  requester and proves the rendered management view contains no token,
  authorization, Snooze, or Dismiss control.
- Workshop independently typechecks and tests the native host commands.
