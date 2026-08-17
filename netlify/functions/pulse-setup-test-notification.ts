import type { Config } from "@netlify/functions";
import {
  pulseError,
  pulseJson,
  readBoundedJsonObject,
  sendRunnerSetupTestNotification,
} from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    const result = await sendRunnerSetupTestNotification(request, await readBoundedJsonObject(request));
    return pulseJson(result, result.repeated ? 200 : 202);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/test-notification", method: ["POST"] };
