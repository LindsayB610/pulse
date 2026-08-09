export type SecureServiceRequest = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; body?: unknown };
export type SecureServiceResponse<T> = { status: number; body: T };
export type SecureServiceRequester = <T>(request: SecureServiceRequest) => Promise<SecureServiceResponse<T>>;

function pulsePath(path: string): string {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("#") || path.includes("..")) throw new Error("Pulse API paths must be relative /api/ paths.");
  return path;
}

function failureMessage(response: SecureServiceResponse<unknown>): string {
  if (typeof response.body === "string" && response.body.trim()) return response.body;
  if (response.body && typeof response.body === "object") {
    const body = response.body as Record<string, unknown>;
    for (const key of ["message", "error"]) {
      if (typeof body[key] === "string" && body[key].trim()) return body[key] as string;
    }
  }
  return `Pulse service request failed (${response.status}).`;
}

async function checked<T>(response: Promise<SecureServiceResponse<T>>): Promise<SecureServiceResponse<T>> {
  const result = await response;
  if (result.status < 200 || result.status >= 300) throw new Error(failureMessage(result));
  return result;
}

/** Pulse owns its API paths; the host supplies only a constrained generic requester. */
export function createPulseService(request: SecureServiceRequester) {
  return {
    snapshot: () => checked(request<{ pulses: unknown[]; state: unknown }>({ method: "GET", path: pulsePath("/api/v1/snapshot") })),
    create: (pulse: unknown) => checked(request<{ pulse: unknown }>({ method: "POST", path: pulsePath("/api/v1/pulses"), body: pulse })),
    update: (id: string, pulse: unknown) => checked(request<{ pulse: unknown }>({ method: "PATCH", path: pulsePath(`/api/v1/pulses/${encodeURIComponent(id)}`), body: pulse })),
    remove: (id: string) => checked(request<unknown>({ method: "DELETE", path: pulsePath(`/api/v1/pulses/${encodeURIComponent(id)}`) })),
  };
}
