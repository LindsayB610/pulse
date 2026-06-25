#!/usr/bin/env node
import {
  createNotificationDispatcherFromEnv,
  createPollingRunner,
  createJsonPulseStateStore,
  getPulseEnvConfig,
  loadPrivatePulseConfig,
  runPulseRunnerTick,
} from "../dist/index.js";

const env = getPulseEnvConfig(process.env);

if (!env.configPath || !env.statePath) {
  console.error("Set PULSE_CONFIG_PATH and PULSE_STATE_PATH before running Pulse.");
  process.exit(1);
}

const config = loadPrivatePulseConfig(env.configPath);
const stateStore = createJsonPulseStateStore(env.statePath);
const notifier = createNotificationDispatcherFromEnv(process.env);
const redactValues = Object.values(env.secrets);
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
  });

  runner.start();
  console.log(JSON.stringify({ watching: true, intervalMs }));
  process.on("SIGINT", () => {
    runner.stop();
    process.exit(0);
  });
} else {
  const result = await runPulseRunnerTick(tickInput);
  console.log(JSON.stringify(result));
}
