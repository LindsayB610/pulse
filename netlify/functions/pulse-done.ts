import type { Config, Context } from "@netlify/functions";
import { markPulseDone, pulseError, pulseJson, requirePulseAuthorization } from "./_shared/pulse.js";

export default async (request: Request, context: Context) => {
  try {
    await requirePulseAuthorization(request);
    const form = new URLSearchParams(await request.text());
    const completionNote = form.get("completionNote")?.trim() || undefined;
    return pulseJson(await markPulseDone(context.params.id, completionNote));
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/v1/occurrences/:id/done", method: ["POST"] };
