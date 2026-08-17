import type { Config } from "@netlify/functions";
import { issuePublicRunnerChallenge, pulseError, pulseJson, readBoundedJsonObject } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    return pulseJson(await issuePublicRunnerChallenge(await readBoundedJsonObject(request)), 201);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/challenge", method: ["POST"] };
