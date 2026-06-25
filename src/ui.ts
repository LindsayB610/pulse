import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  applyOccurrenceAction,
  createPulseEvent,
  type PulseDefinition,
  type PulseEvent,
  type PulseOccurrence,
} from "./model.js";
import type { PulseState, PulseStateStore } from "./storage.js";

export type PulseUiRunnerHealth = {
  status: "running" | "unknown";
  checkedAt: Date;
};

export type PulseManagementPageInput = {
  pulses: PulseDefinition[];
  state: PulseState;
  now: Date;
  runnerHealth?: PulseUiRunnerHealth;
};

export type PulseUiServerInput = {
  pulses: PulseDefinition[];
  stateStore: PulseStateStore;
  now?: () => Date;
  runnerHealth?: () => PulseUiRunnerHealth;
};

export type PulseUiListenInput = {
  host: string;
  port: number;
};

export type PulseUiServer = {
  handle(request: Request): Promise<Response>;
  listen(input: PulseUiListenInput): Promise<{ close(): Promise<void>; port: number }>;
};

export function renderPulseManagementPage(input: PulseManagementPageInput): string {
  const pulseById = new Map(input.pulses.map((pulse) => [pulse.id, pulse]));
  const dueOccurrences = input.state.occurrences
    .filter((occurrence) => occurrence.state === "due")
    .sort(compareDueAt);
  const upcomingOccurrences = input.state.occurrences
    .filter((occurrence) => occurrence.state === "scheduled")
    .sort(compareDueAt)
    .slice(0, 10);
  const completedOccurrences = input.state.occurrences
    .filter((occurrence) => occurrence.state === "done")
    .sort((a, b) => Date.parse(b.completedAt ?? b.dueAt) - Date.parse(a.completedAt ?? a.dueAt))
    .slice(0, 10);
  const health = input.runnerHealth ?? { status: "unknown" as const, checkedAt: input.now };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pulse</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      body {
        margin: 0;
        background: Canvas;
        color: CanvasText;
      }
      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
        padding-bottom: 16px;
      }
      h1,
      h2,
      h3,
      p {
        margin: 0;
      }
      h1 {
        font-size: 28px;
      }
      h2 {
        font-size: 18px;
        margin-top: 28px;
      }
      section {
        display: grid;
        gap: 12px;
      }
      article {
        border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
        border-radius: 8px;
        padding: 14px;
      }
      .meta {
        color: color-mix(in srgb, CanvasText 62%, transparent);
        font-size: 13px;
      }
      .stack {
        display: grid;
        gap: 8px;
      }
      form {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      textarea {
        min-height: 68px;
        resize: vertical;
      }
      textarea,
      button {
        border: 1px solid color-mix(in srgb, CanvasText 22%, transparent);
        border-radius: 6px;
        font: inherit;
        padding: 9px 10px;
      }
      button {
        width: fit-content;
        cursor: pointer;
        font-weight: 700;
      }
      .empty {
        border: 1px dashed color-mix(in srgb, CanvasText 20%, transparent);
        border-radius: 8px;
        padding: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Pulse</h1>
          <p class="meta">Checked ${formatDate(input.now)}</p>
        </div>
        <p class="meta">Runner ${escapeHtml(health.status)} at ${formatDate(health.checkedAt)}</p>
      </header>
      ${renderOccurrenceSection("Due", dueOccurrences, pulseById, input.state.events, true)}
      ${renderOccurrenceSection("Upcoming", upcomingOccurrences, pulseById, input.state.events, false)}
      ${renderOccurrenceSection("Recent History", completedOccurrences, pulseById, input.state.events, false)}
    </main>
  </body>
</html>
`;
}

export function createPulseUiServer(input: PulseUiServerInput): PulseUiServer {
  const now = input.now ?? (() => new Date());

  return {
    async handle(request) {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        const runnerHealth = input.runnerHealth?.();
        return htmlResponse(
          renderPulseManagementPage({
            pulses: input.pulses,
            state: input.stateStore.read(),
            now: now(),
            ...(runnerHealth === undefined ? {} : { runnerHealth }),
          }),
        );
      }

      const doneMatch = url.pathname.match(/^\/occurrences\/(.+)\/done$/);
      if (request.method === "POST" && doneMatch) {
        const occurrenceId = decodeURIComponent(doneMatch[1] ?? "");
        const completionNote = await readCompletionNote(request);
        const state = input.stateStore.read();
        const occurrence = state.occurrences.find((candidate) => candidate.id === occurrenceId);
        if (!occurrence) {
          return textResponse("Occurrence not found.", 404);
        }
        if (occurrence.state === "done") {
          return textResponse("Occurrence is already done.", 409);
        }
        if (occurrence.state !== "due") {
          return textResponse("Occurrence is not due yet.", 409);
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

        return new Response(null, {
          status: 303,
          headers: {
            location: "/",
          },
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

function renderOccurrenceSection(
  title: string,
  occurrences: PulseOccurrence[],
  pulseById: Map<string, PulseDefinition>,
  events: PulseEvent[],
  canComplete: boolean,
): string {
  const content =
    occurrences.length === 0
      ? `<p class="empty">Nothing ${title.toLowerCase()}.</p>`
      : occurrences
          .map((occurrence) => {
            const pulse = pulseById.get(occurrence.pulseId);
            const lastNotification = getLastNotification(events, occurrence.id);

            return `<article class="stack">
          <div class="stack">
            <h3>${escapeHtml(pulse?.title ?? occurrence.pulseId)}</h3>
            <p class="meta">${escapeHtml(occurrence.state)} · due ${formatDate(new Date(occurrence.dueAt))}</p>
            ${pulse?.instructions ? `<p>${escapeHtml(pulse.instructions)}</p>` : ""}
            ${occurrence.completedAt ? `<p class="meta">Completed ${formatDate(new Date(occurrence.completedAt))}</p>` : ""}
            ${occurrence.completionNote ? `<p>${escapeHtml(occurrence.completionNote)}</p>` : ""}
            ${lastNotification ? renderLastNotification(lastNotification) : `<p class="meta">Last notification: none</p>`}
          </div>
          ${canComplete ? renderDoneForm(occurrence) : ""}
        </article>`;
          })
          .join("\n");

  return `<section aria-labelledby="${sectionId(title)}">
        <h2 id="${sectionId(title)}">${escapeHtml(title)}</h2>
        ${content}
      </section>`;
}

function renderDoneForm(occurrence: PulseOccurrence): string {
  return `<form method="post" action="/occurrences/${encodeURIComponent(occurrence.id)}/done">
            <label>
              <span class="meta">Completion note</span>
              <textarea name="completionNote"></textarea>
            </label>
            <button type="submit">Done</button>
          </form>`;
}

function renderLastNotification(event: PulseEvent): string {
  const channel = String(event.metadata?.channel ?? "unknown");
  const ok = event.metadata?.ok === false ? "failed" : "sent";

  return `<p class="meta">Last notification: ${escapeHtml(channel)} ${escapeHtml(ok)} at ${formatDate(
    new Date(event.at),
  )}</p>`;
}

function getLastNotification(events: PulseEvent[], occurrenceId: string): PulseEvent | undefined {
  return events
    .filter((event) => event.type === "notification_sent" && event.occurrenceId === occurrenceId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
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

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function compareDueAt(a: PulseOccurrence, b: PulseOccurrence): number {
  return Date.parse(a.dueAt) - Date.parse(b.dueAt);
}

function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function sectionId(title: string): string {
  return title.toLowerCase().replaceAll(" ", "-");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
