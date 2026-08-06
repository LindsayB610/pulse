#!/usr/bin/env node
import {
  createJsonPulseStateStore,
  createPulseUiServer,
  getPulseEnvConfig,
  loadPrivatePulseConfig,
  readPulseRunnerHealth,
  validatePrivateDeliveryEnv,
} from "../dist/index.js";

const env = getPulseEnvConfig(process.env);
const runnerMode = process.env.PULSE_RUNNER_MODE;

if (runnerMode !== "demo" && runnerMode !== "production") {
  console.error("Set PULSE_RUNNER_MODE to demo or production before starting the Pulse API.");
  process.exit(1);
}

if (!env.configPath || !env.statePath) {
  console.error("Set PULSE_CONFIG_PATH and PULSE_STATE_PATH before starting the Pulse API.");
  process.exit(1);
}

if (runnerMode === "production") {
  try {
    validatePrivateDeliveryEnv(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const apiToken = process.env.PULSE_API_TOKEN;
if (apiToken === undefined || apiToken.length < 32 || /\s/.test(apiToken)) {
  console.error("Set PULSE_API_TOKEN to a private non-whitespace value of at least 32 characters before starting the Pulse API.");
  process.exit(1);
}

const config = loadPrivatePulseConfig(env.configPath);
const stateStore = createJsonPulseStateStore(env.statePath);
const port = Number(process.env.PULSE_API_PORT ?? 8787);
const host = process.env.PULSE_API_HOST ?? "127.0.0.1";
const allowedOrigins = (process.env.PULSE_API_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const api = createPulseUiServer({
  pulses: config.pulses,
  stateStore,
  apiToken,
  allowedOrigins,
  runnerHealth: () => readPulseRunnerHealth(
    process.env.PULSE_RUNNER_HEALTH_PATH ?? `${env.statePath}.runner-health.json`,
    new Date(),
    Math.max(Number(process.env.PULSE_RUNNER_INTERVAL_MS ?? 60_000) * 2, 120_000),
  ),
});

if (process.argv.includes("--once")) {
  console.log(JSON.stringify({ api: true, host, port }));
} else {
  const running = await api.listen({ host, port });
  console.log(JSON.stringify({ api: true, host, port }));
  process.on("SIGINT", () => {
    void running.close().then(() => process.exit(0));
  });
}
