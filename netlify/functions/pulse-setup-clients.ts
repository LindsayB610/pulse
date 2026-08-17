import type { Config } from "@netlify/functions";
import {
  issueAdditionalRunnerClientCode,
  listRunnerClients,
  pulseError,
  pulseJson,
  readBoundedJsonObject,
} from "./_shared/pulse.js";

export default async (request: Request) => {
  try {
    if (request.method === "GET") return pulseJson(await listRunnerClients(request));
    return pulseJson(
      await issueAdditionalRunnerClientCode(request, await readBoundedJsonObject(request)),
      201,
    );
  } catch (error) {
    return pulseError(error);
  }
};

export const config: Config = { path: "/api/setup/clients", method: ["GET", "POST"] };
