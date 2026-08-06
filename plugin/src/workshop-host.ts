import type { SecureServiceRequester } from "./service.js";

export const pulseConfigFile = "pulse.config.json";
export type HostInvoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

export async function createWorkshopSecureServiceRequester(workspaceRoot: string, invoke: HostInvoke): Promise<SecureServiceRequester> {
  await invoke("read_secure_service_metadata", { workspaceRoot, configFile: pulseConfigFile });
  return (request) => invoke("request_configured_secure_service", { workspaceRoot, configFile: pulseConfigFile, request });
}
