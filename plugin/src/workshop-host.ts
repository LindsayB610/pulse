import type { SecureServiceRequester } from "./service.js";

export const pulseConfigFile = "pulse.config.json";
export const pulseManagedServiceId = "pulse-runner";
export type HostInvoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

export type ManagedSetupView = {
  version: 1;
  setupId: string;
  serviceId: string;
  configFile: string;
  installationId: string;
  publicKey: string;
  fingerprint: string;
  suggestedTopic: string;
  state: string;
};

export const pulsePairingContract = {
  serviceIdentity: "pulse-runner",
  apiVersion: "pulse.service.v1",
  setupVersion: "pulse.setup.v1",
  manifestPath: "/api/setup/manifest",
  challengePath: "/api/setup/challenge",
  pairPath: "/api/setup/pair",
  additionalPairPath: "/api/setup/additional-pair",
} as const;

export async function createWorkshopSecureServiceRequester(workspaceRoot: string, invoke: HostInvoke): Promise<SecureServiceRequester> {
  await invoke("read_secure_service_metadata", { workspaceRoot, configFile: pulseConfigFile });
  return (request) => invoke("request_configured_secure_service", { workspaceRoot, configFile: pulseConfigFile, request });
}

export async function managedSetupCapability(invoke: HostInvoke): Promise<boolean> {
  try {
    const result = await invoke<{ available?: boolean; version?: number }>("managed_secure_service_capability", {});
    return result.available === true && result.version === 1;
  } catch {
    return false;
  }
}

export function beginPulseManagedSetup(invoke: HostInvoke): Promise<ManagedSetupView> {
  return invoke("begin_managed_secure_service_setup", { serviceId: pulseManagedServiceId, configFile: pulseConfigFile });
}

export function readPulseManagedSetup(invoke: HostInvoke): Promise<ManagedSetupView> {
  return invoke("read_managed_secure_service_setup", { serviceId: pulseManagedServiceId });
}

export function updatePulseManagedSetup(invoke: HostInvoke, setupId: string, state: string): Promise<ManagedSetupView> {
  return invoke("update_managed_secure_service_setup", { serviceId: pulseManagedServiceId, setupId, state });
}

export function cancelPulseManagedSetup(invoke: HostInvoke, setupId: string): Promise<void> {
  return invoke("cancel_managed_secure_service_setup", { serviceId: pulseManagedServiceId, setupId });
}

export function completePulseManagedSetup(invoke: HostInvoke, setupId: string, endpoint: string): Promise<void> {
  return invoke("complete_managed_secure_service_setup", {
    serviceId: pulseManagedServiceId,
    setupId,
    endpoint,
    contract: pulsePairingContract,
  });
}

export function completePulseExistingSetup(
  invoke: HostInvoke,
  setupId: string,
  endpoint: string,
  invitationCode: string,
): Promise<void> {
  return invoke("complete_managed_secure_service_invitation", {
    serviceId: pulseManagedServiceId,
    setupId,
    endpoint,
    invitationCode,
    contract: pulsePairingContract,
  });
}

export async function createManagedWorkshopSecureServiceRequester(invoke: HostInvoke): Promise<SecureServiceRequester> {
  await invoke("read_managed_secure_service_metadata", { serviceId: pulseManagedServiceId, configFile: pulseConfigFile });
  return (request) => invoke("request_managed_secure_service", {
    serviceId: pulseManagedServiceId,
    configFile: pulseConfigFile,
    request,
  });
}

export function openPulseNotificationCredentialHandoff(invoke: HostInvoke): Promise<{ opened: boolean }> {
  return invoke("open_managed_secure_service_handoff", {
    serviceId: pulseManagedServiceId,
    configFile: pulseConfigFile,
    request: { method: "POST", path: "/api/setup/notification-session" },
    allowedPathPrefix: "/setup/notification",
  });
}

export function disconnectPulseManagedService(invoke: HostInvoke): Promise<{ disconnected: boolean; remoteServicePreserved: boolean }> {
  return invoke("disconnect_managed_secure_service", {
    serviceId: pulseManagedServiceId,
    configFile: pulseConfigFile,
    clientsPath: "/api/setup/clients",
  });
}

export function openPulseSetupUrl(invoke: HostInvoke, url: string): Promise<void> {
  return invoke("open_external_url", { url });
}
