import type { Config } from "@netlify/functions";
import { pulseError, pulseJson, readPublicRunnerManifest } from "./_shared/pulse.js";

export default async () => {
  try {
    return pulseJson(await readPublicRunnerManifest());
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/manifest", method: ["GET"] };
