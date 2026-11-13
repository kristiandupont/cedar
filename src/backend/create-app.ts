import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";

import type { AnyRouter, TRPCError } from "@trpc/server";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

import type { CreateContextOptions } from "./create-trpc";
import { wrapInTransaction } from "./db";

/** Handles one authenticated-or-not WebSocket after the `/ws` upgrade. */
export type WsHandler = (socket: WebSocket, req: IncomingMessage) => Promise<void>;

/**
 * Sent on every HTTP response. These are the values `koa-helmet` (helmet 8)
 * produced with cedar's CSP directives; the API serves JSON, so most matter
 * only if a browser ever renders a response directly.
 */
const securityHeaders: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self';style-src 'self' https://fonts.googleapis.com;font-src 'self' https://fonts.gstatic.com;base-uri 'self';form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Download-Options": "noopen",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "0",
};

const corsAllowMethods = "GET,HEAD,PUT,POST,DELETE,PATCH";

/**
 * Sets the CORS headers: any origin, no credentials. Answers a preflight
 * (`OPTIONS` with `Access-Control-Request-Method`) with 204 and returns true;
 * otherwise returns false and the request continues.
 */
function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  res.setHeader("Vary", "Origin");
  if (req.method !== "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return false;
  }
  if (!req.headers["access-control-request-method"]) return false;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", corsAllowMethods);
  const requestedHeaders = req.headers["access-control-request-headers"];
  if (requestedHeaders) res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
  res.statusCode = 204;
  res.end();
  return true;
}

function sendText(req: IncomingMessage, res: ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(text));
  res.end(req.method === "HEAD" ? undefined : text);
}

/** `/ping` and `/ws` accept GET and HEAD only, like a `@koa/router` GET route. */
function handleGetOnlyRoute(
  req: IncomingMessage,
  res: ServerResponse,
  onGet: () => void,
): void {
  if (req.method === "GET" || req.method === "HEAD") {
    onGet();
    return;
  }
  res.setHeader("Allow", "HEAD, GET");
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.setHeader("Content-Length", 0);
    res.end();
    return;
  }
  sendText(req, res, 405, "Method Not Allowed");
}

function logRequest(req: IncomingMessage, res: ServerResponse): void {
  const started = performance.now();
  res.once("finish", () => {
    const ms = Math.round(performance.now() - started);
    // oxlint-disable-next-line no-console -- request log, as koa-logger wrote
    console.log(`  --> ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
  });
}

/**
 * The HTTP server both apps run: `/ping`, `/ws` (when `wsHandler` is given)
 * and tRPC under `/trpc`. Every request except a CORS preflight runs inside a
 * Knex transaction (see `db.ts`). Call `.listen(port)` on the result.
 */
export function createApp(options: {
  appApi: AnyRouter;
  createContext: (opts: CreateContextOptions) => Promise<unknown>;
  wsHandler?: WsHandler;
  /** Development aid: wait this many ms before handling each request. */
  simulateLatency?: number;
}): Server {
  const { appApi, createContext, wsHandler, simulateLatency } = options;

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    logRequest(req, res);
    if (simulateLatency) await setTimeout(simulateLatency);

    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    if (path === "/ping") {
      handleGetOnlyRoute(req, res, () => sendText(req, res, 200, "pong"));
      return;
    }

    if (path === "/ws" && wsHandler) {
      // A WebSocket arrives as an `upgrade` event, never here.
      handleGetOnlyRoute(req, res, () => sendText(req, res, 426, "Upgrade Required"));
      return;
    }

    if (path === "/trpc" || path.startsWith("/trpc/")) {
      res.statusCode = 200;
      await nodeHTTPRequestHandler({
        router: appApi,
        createContext,
        req,
        res,
        path: path.slice("/trpc/".length),
        // Clients get a generic message for these (see `trpcConfig`), so the
        // server log is the only place the details appear.
        onError: ({ error, path: procedurePath }: { error: TRPCError; path?: string }) => {
          if (error.code === "INTERNAL_SERVER_ERROR") {
            console.error(`tRPC ${procedurePath ?? "(unknown)"} failed:`, error.cause ?? error);
          }
        },
      } as Parameters<typeof nodeHTTPRequestHandler>[0]);
      return;
    }

    sendText(req, res, 404, "Not Found");
  }

  const server = createServer((req, res) => {
    for (const [name, value] of Object.entries(securityHeaders)) {
      res.setHeader(name, value);
    }
    if (handleCors(req, res)) return;

    wrapInTransaction(() => route(req, res))().catch((error: unknown) => {
      console.error("Request failed", req.method, req.url, error);
      if (!res.headersSent) {
        sendText(req, res, 500, "Internal Server Error");
      } else {
        res.end();
      }
    });
  });

  if (wsHandler) {
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path !== "/ws") {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wsHandler(ws, req).catch((error: unknown) => {
          console.error("WebSocket handler failed", error);
          ws.close(1011, "Internal error");
        });
      });
    });
  }

  return server;
}
