import type { Config } from "@netlify/functions";
import { pulseError, pulseJson, readRunnerSetupStatus } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    return pulseJson(await readRunnerSetupStatus(request));
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/status", method: "GET" };
