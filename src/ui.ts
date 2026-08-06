import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  applyOccurrenceAction,
  createPulseEvent,
  type PulseDefinition,
} from "./model.js";
import type { PulseState, PulseStateStore } from "./storage.js";

export type PulseUiRunnerHealth = {
  status: "running" | "stale" | "unknown";
  checkedAt: Date;
};

export type PulseUiServerInput = {
  pulses: PulseDefinition[];
  stateStore: PulseStateStore;
  now?: () => Date;
  runnerHealth?: () => PulseUiRunnerHealth;
  apiToken?: string;
  allowedOrigins?: string[];
};

export type PulseUiListenInput = {
  host: string;
  port: number;
};

export type PulseUiServer = {
  handle(request: Request): Promise<Response>;
  listen(input: PulseUiListenInput): Promise<{ close(): Promise<void>; port: number }>;
};

export function createPulseUiServer(input: PulseUiServerInput): PulseUiServer {
  const now = input.now ?? (() => new Date());

  return {
    async handle(request) {
      const url = new URL(request.url);
      const corsHeaders = apiCorsHeaders(request, input.allowedOrigins ?? []);

      if (request.method === "GET" && url.pathname === "/api/v1/snapshot") {
        if (!isAuthorized(request, input.apiToken)) {
          return textResponse("Unauthorized.", 401, corsHeaders);
        }
        const runnerHealth = input.runnerHealth?.();
        return jsonResponse({
          pulses: input.pulses,
          state: input.stateStore.read(),
          checkedAt: now().toISOString(),
          ...(runnerHealth === undefined ? {} : { runnerHealth }),
        }, corsHeaders);
      }

      if (request.method === "OPTIONS" && url.pathname.startsWith("/api/v1/")) {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      const doneMatch = url.pathname.match(/^\/api\/v1\/occurrences\/(.+)\/done$/);
      if (request.method === "POST" && doneMatch) {
        if (!isAuthorized(request, input.apiToken)) {
          return textResponse("Unauthorized.", 401, corsHeaders);
        }
        const occurrenceId = decodeURIComponent(doneMatch[1] ?? "");
        const completionNote = await readCompletionNote(request);
        return input.stateStore.withExclusive(() => {
          const state = input.stateStore.read();
          const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
          if (!occurrence) {
            return textResponse("Occurrence not found.", 404, corsHeaders);
          }
          if (occurrence.state === "done") {
            return textResponse("Occurrence is already done.", 409, corsHeaders);
          }
          if (occurrence.state !== "due") {
            return textResponse("Occurrence is not due yet.", 409, corsHeaders);
          }

          const action = {
            type: "done" as const,
            at: now(),
            ...(completionNote === undefined ? {} : { completionNote }),
          };
          const completed = applyOccurrenceAction(occurrence, action);
          state.occurrences = state.occurrences.map((candidate) =>
            candidate.id === completed.id ? completed : candidate,
          );
          state.events.push(
            createPulseEvent({
              pulseId: completed.pulseId,
              occurrenceId: completed.id,
              type: "occurrence_completed",
              at: new Date(completed.completedAt ?? action.at),
              ...(completionNote === undefined ? {} : { metadata: { note: completionNote } }),
            }),
          );
          input.stateStore.write(state);

          return jsonResponse({ occurrence: completed }, corsHeaders);
        });
      }

      return textResponse("Not found.", 404);
    },
    listen(listenInput) {
      const server = createServer((message, response) => {
        void requestFromIncomingMessage(message)
          .then((request) => this.handle(request))
          .then((handled) => writeServerResponse(response, handled))
          .catch((error) => {
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : String(error));
          });
      });

      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(listenInput.port, listenInput.host, () => {
          server.off("error", reject);
          const address = server.address();
          const port = typeof address === "object" && address !== null ? (address as AddressInfo).port : listenInput.port;
          resolve({
            port,
            close() {
              return new Promise((closeResolve, closeReject) => {
                server.close((error) => (error ? closeReject(error) : closeResolve()));
              });
            },
          });
        });
      });
    },
  };
}

async function readCompletionNote(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return undefined;
  }

  const form = new URLSearchParams(await request.text());
  const note = form.get("completionNote")?.trim();
  return note === "" ? undefined : note;
}

async function requestFromIncomingMessage(message: IncomingMessage): Promise<Request> {
  const protocol = "http";
  const host = message.headers.host ?? "127.0.0.1";
  const url = `${protocol}://${host}${message.url ?? "/"}`;
  const body = await readIncomingBody(message);

  const init: RequestInit = {
    headers: message.headers as Record<string, string>,
  };
  if (message.method !== undefined) {
    init.method = message.method;
  }
  if (body.length > 0) {
    const requestBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(requestBody).set(body);
    init.body = requestBody;
  }

  return new Request(url, init);
}

function readIncomingBody(message: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    message.on("data", (chunk: Buffer) => chunks.push(chunk));
    message.on("end", () => resolve(Buffer.concat(chunks)));
    message.on("error", reject);
  });
}

async function writeServerResponse(response: ServerResponse, handled: Response): Promise<void> {
  response.statusCode = handled.status;
  handled.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await handled.arrayBuffer()));
}

function textResponse(body: string, status: number, corsHeaders: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function jsonResponse(body: unknown, corsHeaders: Record<string, string> = {}): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function apiCorsHeaders(request: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin === null || !allowedOrigins.includes(origin)) {
    return {};
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function isAuthorized(request: Request, expectedToken: string | undefined): boolean {
  if (expectedToken === undefined || expectedToken === "") {
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${expectedToken}`;
}
