import type { Config } from "@netlify/functions";
import { createPulseDefinition, pulseError, pulseJson, readPulseSnapshot, requirePulseAuthorization } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    await requirePulseAuthorization(request);
    if (request.method === "GET") return pulseJson((await readPulseSnapshot()).pulses);
    return pulseJson({ pulse: await createPulseDefinition(await request.json()) }, 201);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/v1/pulses", method: ["GET", "POST"] };
