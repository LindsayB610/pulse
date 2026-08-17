export const DEPLOYMENT_ADAPTER_SCHEMA_VERSION = "pulse.deployment-adapter.v1" as const;

export type DeploymentCapability = "create" | "return" | "manage" | "repair" | "update" | "export" | "delete";

export type DeploymentAdapter = {
  schemaVersion: typeof DEPLOYMENT_ADAPTER_SCHEMA_VERSION;
  id: string;
  label: string;
  supportLevel: "guided" | "compatible";
  capabilities: Record<DeploymentCapability, boolean>;
  handoff: {
    mode: "browser-template";
    baseUrl: string;
    publicFragmentFields: {
      setupPublicKey: string;
      suggestedTopic: string;
      notificationServer: string;
      returnUrl: string;
    };
  };
  dashboardUrl: string;
  documentationUrl: string;
};

export type DeploymentHandoffInput = {
  setupPublicKey: string;
  suggestedTopic: string;
  notificationServer: string;
  returnUrl: string;
};

export function createNetlifyDeploymentAdapter(): DeploymentAdapter {
  return {
    schemaVersion: DEPLOYMENT_ADAPTER_SCHEMA_VERSION,
    id: "netlify",
    label: "Netlify",
    supportLevel: "guided",
    capabilities: {
      create: true,
      return: true,
      manage: true,
      repair: true,
      update: true,
      export: true,
      delete: true,
    },
    handoff: {
      mode: "browser-template",
      baseUrl: "https://app.netlify.com/start/deploy?repository=https%3A%2F%2Fgithub.com%2FLindsayB610%2Fpulse",
      publicFragmentFields: {
        setupPublicKey: "PULSE_SETUP_PUBLIC_KEY",
        suggestedTopic: "PULSE_NTFY_TOPIC",
        notificationServer: "PULSE_NTFY_SERVER",
        returnUrl: "PULSE_SETUP_RETURN_URL",
      },
    },
    dashboardUrl: "https://app.netlify.com/teams",
    documentationUrl: "https://docs.netlify.com/deploy/create-deploys/",
  };
}

export function assertDeploymentAdapter(value: DeploymentAdapter): void {
  if (value.schemaVersion !== DEPLOYMENT_ADAPTER_SCHEMA_VERSION) throw new Error("Deployment adapter version is unsupported.");
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(value.id) || value.label.trim() === "") {
    throw new Error("Deployment adapter identity is invalid.");
  }
  const capabilityNames: DeploymentCapability[] = ["create", "return", "manage", "repair", "update", "export", "delete"];
  if (capabilityNames.some((name) => typeof value.capabilities[name] !== "boolean")) {
    throw new Error("Deployment adapter capabilities are invalid.");
  }
  normalizePublicHttpsPage(value.handoff.baseUrl);
  normalizePublicHttpsPage(value.dashboardUrl);
  normalizePublicHttpsPage(value.documentationUrl);
  const fragmentNames = Object.values(value.handoff.publicFragmentFields);
  if (new Set(fragmentNames).size !== fragmentNames.length || fragmentNames.some((name) => !/^[A-Z][A-Z0-9_]{2,63}$|^[a-z][a-z0-9_]{2,63}$/.test(name))) {
    throw new Error("Deployment adapter fragment fields are invalid.");
  }
}

export function createDeploymentHandoff(
  adapter: DeploymentAdapter,
  input: DeploymentHandoffInput,
): { adapterId: string; url: string } {
  assertDeploymentAdapter(adapter);
  if (!/^[A-Za-z0-9_-]{24,160}$/.test(input.suggestedTopic)) throw new Error("Suggested notification topic is invalid.");
  if (!/^[A-Za-z0-9_-]{24,4096}$/.test(input.setupPublicKey)) throw new Error("Setup public key is invalid.");
  const notificationServer = normalizePublicHttpsOrigin(input.notificationServer);
  const returnUrl = new URL(input.returnUrl);
  if (returnUrl.protocol !== "workshop:" || returnUrl.username || returnUrl.password) {
    throw new Error("Setup return URL is invalid.");
  }
  const url = normalizePublicHttpsPage(adapter.handoff.baseUrl);
  const fragment = new URLSearchParams();
  fragment.set(adapter.handoff.publicFragmentFields.setupPublicKey, input.setupPublicKey);
  fragment.set(adapter.handoff.publicFragmentFields.suggestedTopic, input.suggestedTopic);
  fragment.set(adapter.handoff.publicFragmentFields.notificationServer, notificationServer);
  fragment.set(adapter.handoff.publicFragmentFields.returnUrl, returnUrl.toString());
  url.hash = fragment.toString();
  return { adapterId: adapter.id, url: url.toString() };
}

function normalizePublicHttpsPage(value: string): URL {
  const url = new URL(value);
  assertPublicHttpsHost(url);
  if (url.username || url.password) throw new Error("Deployment handoff must use a public HTTPS page.");
  return url;
}

function normalizePublicHttpsOrigin(value: string): string {
  const url = normalizePublicHttpsPage(value);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("Notification server must be a public HTTPS origin.");
  return url.origin;
}

function assertPublicHttpsHost(url: URL): void {
  const hostname = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  const privateIpv4 = /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  const privateIpv6 = /^(?:::|::1$|::ffff:|f[cd][0-9a-f:]*$|fe80:)/i;
  if (
    url.protocol !== "https:" ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    privateIpv4.test(hostname) ||
    privateIpv6.test(hostname)
  ) {
    throw new Error("Deployment handoff must use a public HTTPS page.");
  }
}
