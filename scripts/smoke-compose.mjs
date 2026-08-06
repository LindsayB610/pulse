import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;
// Keep the temporary bind mount beside both public checkouts so Docker Desktop
// can mount it reliably; it is removed in finally and never enters either repo.
const privateRoot = mkdtempSync(join(root, "..", ".pulse-compose-smoke-"));
const apiToken = "pulse-compose-smoke-api-token-0123456789";

function run(args) {
  const result = spawnSync(process.execPath, ["bin/pulse-compose.mjs", ...args], {
    cwd: root,
    env: { ...process.env, PULSE_PRIVATE_ROOT: privateRoot },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `pulse-compose ${args.join(" ")} failed`);
}

function composeLogs() {
  const result = spawnSync(process.execPath, ["bin/pulse-compose.mjs", "logs", "pulse", "pulse-api"], {
    cwd: root,
    env: { ...process.env, PULSE_PRIVATE_ROOT: privateRoot },
    encoding: "utf8",
  });
  process.stderr.write(result.stdout || result.stderr);
}

try {
  writeFileSync(join(privateRoot, ".env"), [
    "PULSE_CONFIG_PATH=/pulse/private/pulses.yaml",
    "PULSE_STATE_PATH=/pulse/private/state.json",
    "PULSE_PRIVATE_ROOT=/pulse/private",
    "PULSE_RUNNER_MODE=production",
    "PULSE_NOTIFY_PROVIDER=ntfy",
    "PULSE_NTFY_SERVER=https://ntfy.sh",
    "PULSE_NTFY_TOPIC=PulseComposeSmokeTopic0123456789",
    "PULSE_NTFY_TOKEN=pulse-compose-smoke-ntfy-token",
    `PULSE_API_TOKEN=${apiToken}`,
    "PULSE_RUNNER_INTERVAL_MS=50",
    "",
  ].join("\n"));
  writeFileSync(join(privateRoot, "pulses.yaml"), "pulses: []\n");
  run(["up", "-d", "--build"]);
  const response = await waitForApi();
  if (!response.ok) throw new Error(`Pulse API returned ${response.status}.`);
  const snapshot = await response.json();
  if (snapshot.runnerHealth?.status !== "running") throw new Error("Pulse runner heartbeat was not running.");
  process.stdout.write("Pulse Compose smoke passed.\n");
} finally {
  try {
    run(["down", "--volumes"]);
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:8787/api/v1/snapshot", {
        headers: { authorization: `Bearer ${apiToken}` },
      });
      if (response.ok) return response;
      lastError = new Error(`Pulse API returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  composeLogs();
  throw lastError instanceof Error ? lastError : new Error("Pulse API did not become ready.");
}
