import type { Config } from "@netlify/functions";
import { pulseError, readBoundedJsonObject, saveRunnerNotificationSecret } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    await saveRunnerNotificationSecret(request, await readBoundedJsonObject(request));
    return new Response(null, {
      status: 204,
      headers: {
        "cache-control": "no-store",
        "set-cookie": "pulse_setup=; Path=/api/setup/notification-secret; Max-Age=0; Secure; HttpOnly; SameSite=Strict",
      },
    });
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/notification-secret", method: "POST" };
