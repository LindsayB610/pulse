import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("G3 Netlify template requests only public setup values and derives its production origin", async () => {
  const [toml, landing, shared] = await Promise.all([
    readFile(new URL("netlify.toml", root), "utf8"),
    readFile(new URL("netlify/public/index.html", root), "utf8"),
    readFile(new URL("netlify/functions/_shared/pulse.ts", root), "utf8"),
  ]);
  for (const name of ["PULSE_SETUP_PUBLIC_KEY", "PULSE_NTFY_TOPIC", "PULSE_NTFY_SERVER", "PULSE_SETUP_RETURN_URL"]) {
    assert.match(toml, new RegExp(`\\b${name}\\b`));
  }
  assert.doesNotMatch(toml, /PULSE_NTFY_TOKEN|PULSE_API_TOKEN|PULSE_NOTIFICATION_ACTION_SECRET/);
  assert.doesNotMatch(toml, /lindsay|workshop-private|Documents\//i);
  assert.doesNotMatch(toml, /PULSE_PUBLIC_BASE_URL\s*=/);
  assert.match(shared, /process\.env\.URL/);
  assert.match(landing, /runner is online/i);
  assert.match(landing, /no reminder data or account credentials/i);
});

test("G3 runner-owned token page removes fragment capabilities and never persists or echoes the token", async () => {
  const [shared, endpoint, exchange] = await Promise.all([
    readFile(new URL("netlify/functions/_shared/pulse.ts", root), "utf8"),
    readFile(new URL("netlify/functions/pulse-setup-notification-secret.ts", root), "utf8"),
    readFile(new URL("netlify/functions/pulse-setup-notification-exchange.ts", root), "utf8"),
  ]);
  assert.match(shared, /history\.replaceState\(null,''.*,location\.pathname\)/);
  assert.doesNotMatch(shared, /localStorage|sessionStorage|document\.cookie/);
  assert.match(exchange, /set-cookie/);
  assert.match(shared, /HttpOnly; SameSite=Strict/);
  assert.match(endpoint, /Max-Age=0; Secure; HttpOnly; SameSite=Strict/);
  assert.match(shared, /body:JSON\.stringify\(\{token:/);
  assert.doesNotMatch(shared, /body:JSON\.stringify\(\{sessionId:params/);
  assert.match(shared, /runner-delivery-secret\.json/);
  assert.match(shared, /process\.env\.CONTEXT !== "production"/);
});
