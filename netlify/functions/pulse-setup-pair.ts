import type { Config } from "@netlify/functions";
import { pairPublicRunnerClient, pulseError, pulseJson, readBoundedJsonObject } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    return pulseJson(await pairPublicRunnerClient(await readBoundedJsonObject(request)), 201);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/pair", method: ["POST"] };
