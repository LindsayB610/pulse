import type { Config, Context } from "@netlify/functions";
import { notificationActionOccurrenceId } from "../../src/notification-actions.js";
import {
  pulseError,
  pulseJson,
  snoozePulseFromNotification,
  verifyNotificationAction,
} from "./_shared/pulse.js";

/** A 30-minute snooze from the Android notification action. */
export default async (request: Request, context: Context) => {
  const occurrenceId = notificationActionOccurrenceId(context.params.id);
  try {
    const token = new URL(request.url).searchParams.get("token");
    console.info("Pulse notification Snooze action received", {
      method: request.method,
      occurrenceId,
      tokenPresent: token !== null && token !== "",
    });
    await verifyNotificationAction("snooze", occurrenceId, token);
    const result = await snoozePulseFromNotification(occurrenceId);
    console.info("Pulse notification Snooze action completed", { occurrenceId });
    return pulseJson(result);
  } catch (error) {
    console.warn("Pulse notification Snooze action rejected", {
      method: request.method,
      occurrenceId,
      status: error instanceof Error && "status" in error ? (error as { status?: number }).status : undefined,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return pulseError(error);
  }
};

export const config: Config = {
  path: "/api/v1/notification-actions/:id/snooze",
  method: ["GET", "POST"],
};
