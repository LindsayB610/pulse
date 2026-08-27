import type { Config } from "@netlify/functions";
import { migratePulseRecurrence, pulseError, pulseJson, readBoundedJsonObject, requirePulseAuthorization } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    await requirePulseAuthorization(request);
    return pulseJson(await migratePulseRecurrence(await readBoundedJsonObject(request)));
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/v1/migrations/recurrence", method: ["POST"] };
