import type { Config, Context } from "@netlify/functions";
import { pulseError, pulseJson, revokePublicRunnerClient } from "./_shared/pulse.js";

export default async (request: Request, context: Context) => {
  try {
    return pulseJson({ client: await revokePublicRunnerClient(request, context.params.id) });
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/clients/:id", method: ["DELETE"] };
