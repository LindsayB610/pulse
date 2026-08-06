import type { Config, Context } from "@netlify/functions";
import { notificationActionOccurrenceId } from "../../src/notification-actions.js";
import {
  markPulseDoneFromNotification,
  pulseError,
  pulseJson,
  verifyNotificationAction,
} from "./_shared/pulse.js";

/**
 * Called only by ntfy's Android HTTP notification action. The HMAC proof is
 * tied to one occurrence, so the Workshop API credential never
 * leaves Netlify and tapping an old notification remains harmless.
 */
export default async (request: Request, context: Context) => {
  const occurrenceId = notificationActionOccurrenceId(context.params.id);
  try {
    const token = new URL(request.url).searchParams.get("token");
    console.info("Pulse notification Done action received", {
      method: request.method,
      occurrenceId,
      tokenPresent: token !== null && token !== "",
    });
    await verifyNotificationAction("done", occurrenceId, token);
    const result = await markPulseDoneFromNotification(occurrenceId);
    console.info("Pulse notification Done action completed", { occurrenceId });
    return pulseJson(result);
  } catch (error) {
    console.warn("Pulse notification Done action rejected", {
      method: request.method,
      occurrenceId,
      status: error instanceof Error && "status" in error ? (error as { status?: number }).status : undefined,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return pulseError(error);
  }
};

export const config: Config = {
  path: "/api/v1/notification-actions/:id/done",
  method: ["GET", "POST"],
};
