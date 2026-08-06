export type SecureServiceRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; body?: unknown };
export type SecureServiceResponse<T> = { status: number; body: T };
export type SecureServiceRequester = <T>(request: SecureServiceRequest) => Promise<SecureServiceResponse<T>>;

function pulsePath(path: string): string {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("#") || path.includes("..")) throw new Error("Pulse API paths must be relative /api/ paths.");
  return path;
}

/** Pulse owns its API paths; the host supplies only a constrained generic requester. */
export function createPulseService(request: SecureServiceRequester) {
  return {
    snapshot: () => request<{ pulses: unknown[]; state: unknown }>({ method: "GET", path: pulsePath("/api/v1/snapshot") }),
    create: (pulse: unknown) => request<{ pulse: unknown }>({ method: "POST", path: pulsePath("/api/v1/pulses"), body: pulse }),
    update: (id: string, pulse: unknown) => request<{ pulse: unknown }>({ method: "PATCH", path: pulsePath(`/api/v1/pulses/${encodeURIComponent(id)}`), body: pulse }),
    remove: (id: string) => request<unknown>({ method: "DELETE", path: pulsePath(`/api/v1/pulses/${encodeURIComponent(id)}`) }),
  };
}
