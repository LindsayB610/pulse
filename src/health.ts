import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type PulseRunnerHealth = {
  status: "running" | "stale" | "unknown";
  checkedAt: Date;
};

export function writePulseRunnerHeartbeat(path: string, checkedAt: Date = new Date()): void {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const temporaryPath = `${resolvedPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ checkedAt: checkedAt.toISOString() })}\n`);
  renameSync(temporaryPath, resolvedPath);
}

export function readPulseRunnerHealth(path: string, now: Date, staleAfterMs: number): PulseRunnerHealth {
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath)) {
    return { status: "unknown", checkedAt: now };
  }
  try {
    const checkedAt = new Date(JSON.parse(readFileSync(resolvedPath, "utf8")).checkedAt);
    if (Number.isNaN(checkedAt.getTime())) {
      return { status: "unknown", checkedAt: now };
    }
    return { status: now.getTime() - checkedAt.getTime() > staleAfterMs ? "stale" : "running", checkedAt };
  } catch {
    return { status: "unknown", checkedAt: now };
  }
}
