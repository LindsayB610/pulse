import type { Config } from "@netlify/functions";
import { createPulseDefinition, pulseError, pulseJson, readPulseSnapshot, requirePulseAuthorization } from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    await requirePulseAuthorization(request);
    if (request.method === "GET") return pulseJson((await readPulseSnapshot()).pulses);
    const pulse = await createPulseDefinition(await request.json());
    const snapshot = await readPulseSnapshot();
    const nextOccurrence = snapshot.state.occurrences.find((occurrence) => occurrence.pulseId === pulse.id && occurrence.state !== "done");
    return pulseJson({ pulse, nextOccurrence }, 201);
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/v1/pulses", method: ["GET", "POST"] };
