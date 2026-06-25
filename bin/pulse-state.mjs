#!/usr/bin/env node
import { readFileSync } from "node:fs";

import {
  copyPrivateFileBackup,
  createJsonPulseStateStore,
  createPulseBackup,
  exportPulseState,
  getPulseEnvConfig,
  importPulseState,
  restorePulseBackup,
} from "../dist/index.js";

const command = process.argv[2];
const env = getPulseEnvConfig(process.env);

try {
  if (command === "export") {
    requireStatePath();
    process.stdout.write(exportPulseState(createJsonPulseStateStore(env.statePath)));
  } else if (command === "import") {
    requireStatePath();
    const inputPath = readArg("--input");
    importPulseState(createJsonPulseStateStore(env.statePath), readTextFile(inputPath));
    console.log(JSON.stringify({ imported: true, statePath: env.statePath }));
  } else if (command === "backup") {
    requireStatePath();
    const backupDir = readArg("--backup-dir");
    const backup = createPulseBackup({
      statePath: env.statePath,
      backupDir,
    });
    if (env.configPath) {
      copyPrivateFileBackup(env.configPath, backupDir);
    }
    console.log(JSON.stringify({ backupPath: backup.path }));
  } else if (command === "restore") {
    requireStatePath();
    const backupPath = readArg("--backup");
    restorePulseBackup({
      backupPath,
      statePath: env.statePath,
    });
    console.log(JSON.stringify({ restored: true, statePath: env.statePath }));
  } else {
    throw new Error("Usage: pulse-state export|import|backup|restore");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function requireStatePath() {
  if (!env.statePath) {
    throw new Error("Set PULSE_STATE_PATH before using Pulse state commands.");
  }
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index === -1 || value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readTextFile(path) {
  return readFileSync(path, "utf8");
}
