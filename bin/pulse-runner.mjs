#!/usr/bin/env node
import {
  createNotificationDispatcherFromEnv,
  createPollingRunner,
  createJsonPulseStateStore,
  getPulseEnvConfig,
  loadPrivatePulseConfig,
  runPulseRunnerTick,
  validatePrivateDeliveryEnv,
  writePulseRunnerHeartbeat,
} from "../dist/index.js";

const runnerMode = process.env.PULSE_RUNNER_MODE;
if (runnerMode !== "demo" && runnerMode !== "production") {
  console.error("Set PULSE_RUNNER_MODE to demo or production before running Pulse.");
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

const env = getPulseEnvConfig(process.env);

if (!env.configPath || !env.statePath) {
  console.error("Set PULSE_CONFIG_PATH and PULSE_STATE_PATH before running Pulse.");
  process.exit(1);
}

const config = loadPrivatePulseConfig(env.configPath);
const stateStore = createJsonPulseStateStore(env.statePath);
const notifier = createNotificationDispatcherFromEnv(process.env);
const healthPath = process.env.PULSE_RUNNER_HEALTH_PATH ?? `${env.statePath}.runner-health.json`;
const redactValues = [...Object.values(env.secrets), ...Object.values(env.recipients)];
const tickInput = {
  now: new Date(),
  pulses: config.pulses,
  stateStore,
  notifier,
  redactValues,
};

if (process.argv.includes("--watch")) {
  const intervalMs = Number(process.env.PULSE_RUNNER_INTERVAL_MS ?? 60_000);
  const runner = createPollingRunner({
    pulses: config.pulses,
    stateStore,
    notifier,
    redactValues,
    intervalMs,
    onTick: () => writePulseRunnerHeartbeat(healthPath),
  });

  runner.start();
  console.log(JSON.stringify({ watching: true, intervalMs }));
  process.on("SIGINT", () => {
    runner.stop();
    process.exit(0);
  });
} else {
  const result = await runPulseRunnerTick(tickInput);
  writePulseRunnerHeartbeat(healthPath);
  console.log(JSON.stringify(result));
}
