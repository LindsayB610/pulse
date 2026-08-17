import type { Config } from "@netlify/functions";
import { issueRunnerNotificationSecretSession, pulseError, pulseJson } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    return pulseJson(await issueRunnerNotificationSecretSession(request), 201);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/notification-session", method: "POST" };
