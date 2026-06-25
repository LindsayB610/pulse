#!/usr/bin/env node
import {
  createJsonPulseStateStore,
  createPulseUiServer,
  getPulseEnvConfig,
  loadPrivatePulseConfig,
} from "../dist/index.js";

const env = getPulseEnvConfig(process.env);

if (!env.configPath || !env.statePath) {
  console.error("Set PULSE_CONFIG_PATH and PULSE_STATE_PATH before starting the Pulse UI.");
  process.exit(1);
}

const config = loadPrivatePulseConfig(env.configPath);
const stateStore = createJsonPulseStateStore(env.statePath);
const port = Number(process.env.PULSE_UI_PORT ?? 8787);
const host = process.env.PULSE_UI_HOST ?? "127.0.0.1";
const ui = createPulseUiServer({
  pulses: config.pulses,
  stateStore,
  runnerHealth: () => ({
    status: "unknown",
    checkedAt: new Date(),
  }),
});

if (process.argv.includes("--once")) {
  console.log(JSON.stringify({ ui: true, host, port }));
} else {
  const running = await ui.listen({ host, port });
  console.log(JSON.stringify({ ui: true, host, port }));
  process.on("SIGINT", () => {
    void running.close().then(() => process.exit(0));
  });
}
