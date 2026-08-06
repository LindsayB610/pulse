import type { Config, Context } from "@netlify/functions";
import { deletePulseDefinition, pulseError, pulseJson, requirePulseAuthorization, updatePulseDefinition } from "./_shared/pulse.js";

export default async (request: Request, context: Context) => {
  try {
    requirePulseAuthorization(request);
    const id = context.params.id;
    if (request.method === "PATCH") return pulseJson({ pulse: await updatePulseDefinition(id, await request.json()) });
    if (request.method === "DELETE") {
      await deletePulseDefinition(id);
      return new Response(null, { status: 204 });
    }
    return pulseJson({ message: "Method not allowed." }, 405);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/v1/pulses/:id", method: ["PATCH", "DELETE"] };
