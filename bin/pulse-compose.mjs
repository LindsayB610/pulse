#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { validatePrivateRoot } from "../scripts/private-root.mjs";

try {
  validatePrivateRoot(process.env.PULSE_PRIVATE_ROOT);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const result = spawnSync("docker", ["compose", "-f", "deploy/docker-compose.yml", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
