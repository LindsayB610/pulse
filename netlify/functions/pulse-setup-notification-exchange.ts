import type { Config } from "@netlify/functions";
import {
  exchangeRunnerNotificationSecretSession,
  pulseError,
  readBoundedJsonObject,
} from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    const { cookie } = await exchangeRunnerNotificationSecretSession(
      request,
      await readBoundedJsonObject(request),
    );
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store", "set-cookie": cookie },
    });
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/notification-exchange", method: "POST" };
