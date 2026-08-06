import type { Config } from "@netlify/functions";
import { pulseError, pulseJson, readPulseSnapshot, requirePulseAuthorization } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    requirePulseAuthorization(request);
    return pulseJson(await readPulseSnapshot());
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/v1/snapshot", method: ["GET"] };
