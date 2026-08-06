export type PulsePrivateConfig = { version: 1; endpoint: string; credentialRef: string };

export function parsePulsePrivateConfig(value: unknown, development = false): PulsePrivateConfig {
  if (!value || typeof value !== "object") throw new Error("Pulse config must be an object.");
  const config = value as Record<string, unknown>;
  if (config.version !== 1 || typeof config.endpoint !== "string" || typeof config.credentialRef !== "string" || !config.credentialRef.trim()) throw new Error("Pulse config is invalid.");
  const endpoint = new URL(config.endpoint);
  if (endpoint.pathname !== "/" || endpoint.search || endpoint.hash) throw new Error("Pulse endpoint must be an origin.");
  const local = endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(development && local)) throw new Error("Pulse endpoint must use HTTPS.");
  return { version: 1, endpoint: endpoint.origin, credentialRef: config.credentialRef };
}
