import type { Config } from "@netlify/functions";
import { pairAdditionalPublicRunnerClient, pulseError, pulseJson, readBoundedJsonObject } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    return pulseJson(await pairAdditionalPublicRunnerClient(await readBoundedJsonObject(request)), 201);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/additional-pair", method: ["POST"] };
