import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { createApp } from "./create-app";
import type { BaseContext } from "./create-trpc";
import { buildContext, trpcConfig } from "./create-trpc";
import { getTrx, initDb, runInSavepoint } from "./db";
import { createSocketRegistry } from "./socket-registry";

/**
 * End-to-end tests for the HTTP server `createApp` returns: a real server on a
 * random port, called with `fetch` and a `ws` client. They pin the behaviour the
 * apps rely on (routes, headers, CORS, per-request transactions, socket auth) so
 * the server implementation can change underneath without the apps noticing.
 *
 * Knex is replaced by a fake whose `transaction()` records begin/commit/rollback,
 * so no database is needed.
 */

const knexFake = vi.hoisted(() => {
  const log: string[] = [];
  let next = 0;

  type FakeTrx = {
    name: string;
    transaction: <T>(callback: (trx: FakeTrx) => Promise<T>) => Promise<T>;
  };

  /** Mirrors Knex: a nested transaction is a savepoint, and siblings run one
   * after another (each waits for the previous one to finish). */
  function makeTrx(name: string): FakeTrx {
    let children = 0;
    let lastChild: Promise<unknown> = Promise.resolve();
    return {
      name,
      transaction<T>(callback: (trx: FakeTrx) => Promise<T>): Promise<T> {
        const child = makeTrx(`${name}.${++children}`);
        const run = lastChild.then(async () => {
          log.push(`savepoint ${child.name}`);
          try {
            const result = await callback(child);
            log.push(`release ${child.name}`);
            return result;
          } catch (error) {
            log.push(`rollback to ${child.name}`);
            throw error;
          }
        });
        lastChild = run.catch(() => {});
        return run;
      },
    };
  }

  const db = {
    async transaction<T>(callback: (trx: FakeTrx) => Promise<T>): Promise<T> {
      const trx = makeTrx(String(++next));
      log.push(`begin ${trx.name}`);
      try {
        const result = await callback(trx);
        log.push(`commit ${trx.name}`);
        return result;
      } catch (error) {
        log.push(`rollback ${trx.name}`);
        throw error;
      }
    },
  };
  return { log, db, reset: () => ((log.length = 0), (next = 0)) };
});

vi.mock("knex", () => ({ default: () => knexFake.db }));

type User = { id: number };

const t = initTRPC.context<BaseContext<User>>().create(trpcConfig);

/** The base procedure the apps use: every procedure runs in a savepoint. */
const procedure = t.procedure.use(t.middleware(({ next }) => runInSavepoint(() => next())));

const trxName = () => (getTrx() as unknown as { name: string }).name;

const appApi = t.router({
  whoami: procedure.query(({ ctx }) => ({
    user: ctx.user,
    origin: ctx.origin,
    workspaceVersion: ctx.workspaceVersion,
    // A Date checks that SuperJSON is the transformer.
    at: new Date(0),
  })),
  write: procedure.mutation(() => ({ trx: trxName() })),
  fail: procedure.mutation(() => {
    trxName();
    throw new TRPCError({ code: "BAD_REQUEST", message: "nope" });
  }),
  crash: procedure.mutation(() => {
    trxName();
    throw new Error("unexpected");
  }),
});

const createContext = buildContext<User>({
  decodeSessionToken: async (token) => (token === "good" ? { id: 7 } : undefined),
});

/** Headers that vary per run or per Node version are left out of snapshots. */
const volatileHeaders = new Set(["date", "connection", "keep-alive"]);

function stableHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of [...response.headers.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!volatileHeaders.has(key)) out[key] = value;
  }
  return out;
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `127.0.0.1:${port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

let registry: ReturnType<typeof createSocketRegistry<User>>;
let server: Server;
let host: string;

beforeAll(async () => {
  initDb({ client: "pg" });
  registry = createSocketRegistry<User>({
    authenticate: async (token) => (token === "good" ? { id: 7 } : undefined),
    resolveSubscriptions: (user) => [`member:${user.id}`],
    authTimeoutMs: 100,
  });
  server = createApp({ appApi, createContext, wsHandler: registry.wsHandler }).listen(0);
  host = await listen(server);
});

afterAll(async () => {
  await close(server);
});

beforeEach(() => {
  knexFake.reset();
  // The request logger writes to stdout; keep test output readable.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function trpcQuery(path: string, init?: RequestInit) {
  const response = await fetch(`http://${host}/trpc/${path}`, init);
  return { response, body: (await response.json()) as Record<string, any> };
}

async function trpcMutation(path: string, init?: RequestInit) {
  const response = await fetch(`http://${host}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...init,
  });
  return { response, body: (await response.json()) as Record<string, any> };
}

describe("createApp: HTTP", () => {
  it("answers /ping with pong and the security headers", async () => {
    const response = await fetch(`http://${host}/ping`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("pong");
    expect(stableHeaders(response)).toMatchInlineSnapshot(`
      {
        "access-control-allow-origin": "*",
        "content-length": "4",
        "content-security-policy": "default-src 'self';style-src 'self' https://fonts.googleapis.com;font-src 'self' https://fonts.gstatic.com;base-uri 'self';form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';upgrade-insecure-requests",
        "content-type": "text/plain; charset=utf-8",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
        "origin-agent-cluster": "?1",
        "referrer-policy": "no-referrer",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "vary": "Origin",
        "x-content-type-options": "nosniff",
        "x-dns-prefetch-control": "off",
        "x-download-options": "noopen",
        "x-frame-options": "SAMEORIGIN",
        "x-permitted-cross-domain-policies": "none",
        "x-xss-protection": "0",
      }
    `);
  });

  it("answers HEAD /ping without a body", async () => {
    const response = await fetch(`http://${host}/ping`, { method: "HEAD" });
    expect({ status: response.status, body: await response.text() }).toMatchInlineSnapshot(`
      {
        "body": "",
        "status": 200,
      }
    `);
  });

  // Under Koa this was a 500: koa-easy-ws only adds `ctx.ws` to upgrade requests.
  it("answers a plain GET /ws (no upgrade) with 426", async () => {
    const response = await fetch(`http://${host}/ws`);
    expect({ status: response.status, body: await response.text() }).toEqual({
      status: 426,
      body: "Upgrade Required",
    });
  });

  it("returns 404 for unknown paths", async () => {
    const response = await fetch(`http://${host}/nope`);
    expect(response.status).toBe(404);
    expect(await response.text()).toMatchInlineSnapshot(`"Not Found"`);
  });

  it("returns 405 for a known path with the wrong method", async () => {
    const response = await fetch(`http://${host}/ping`, { method: "POST" });
    expect({ status: response.status, allow: response.headers.get("allow") })
      .toMatchInlineSnapshot(`
        {
          "allow": "HEAD, GET",
          "status": 405,
        }
      `);
  });

  it("serves a tRPC query with the context built from the request", async () => {
    const { response, body } = await trpcQuery("whoami", {
      headers: {
        authorization: "Bearer good",
        origin: "https://app.example",
        "x-workspace-version": "2026-01-02T03:04:05.000Z",
      },
    });
    expect(response.status).toBe(200);
    expect(superjson.deserialize(body.result.data)).toEqual({
      user: { id: 7 },
      origin: "https://app.example",
      workspaceVersion: new Date("2026-01-02T03:04:05.000Z"),
      at: new Date(0),
    });
    expect(stableHeaders(response)).toMatchInlineSnapshot(`
      {
        "access-control-allow-origin": "*",
        "content-length": "223",
        "content-security-policy": "default-src 'self';style-src 'self' https://fonts.googleapis.com;font-src 'self' https://fonts.gstatic.com;base-uri 'self';form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';upgrade-insecure-requests",
        "content-type": "application/json",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
        "origin-agent-cluster": "?1",
        "referrer-policy": "no-referrer",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "vary": "Origin",
        "x-content-type-options": "nosniff",
        "x-dns-prefetch-control": "off",
        "x-download-options": "noopen",
        "x-frame-options": "SAMEORIGIN",
        "x-permitted-cross-domain-policies": "none",
        "x-xss-protection": "0",
      }
    `);
  });

  it("leaves the user undefined for an unknown token", async () => {
    const { body } = await trpcQuery("whoami", {
      headers: { authorization: "Bearer bad" },
    });
    expect(superjson.deserialize<{ user: unknown }>(body.result.data).user).toBeUndefined();
  });

  it("returns a tRPC 404 for an unknown procedure", async () => {
    const { response, body } = await trpcQuery("missing");
    expect({ status: response.status, code: body.error.json.data.code })
      .toMatchInlineSnapshot(`
        {
          "code": "NOT_FOUND",
          "status": 404,
        }
      `);
  });
});

describe("createApp: CORS", () => {
  it("allows any origin on actual requests", async () => {
    const response = await fetch(`http://${host}/ping`, {
      headers: { origin: "https://elsewhere.example" },
    });
    expect({
      allowOrigin: response.headers.get("access-control-allow-origin"),
      vary: response.headers.get("vary"),
    }).toMatchInlineSnapshot(`
      {
        "allowOrigin": "*",
        "vary": "Origin",
      }
    `);
  });

  it("answers a preflight with 204 and the allowed methods and headers", async () => {
    const response = await fetch(`http://${host}/trpc/write`, {
      method: "OPTIONS",
      headers: {
        origin: "https://elsewhere.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,x-workspace-version",
      },
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(stableHeaders(response)).toMatchInlineSnapshot(`
      {
        "access-control-allow-headers": "authorization,content-type,x-workspace-version",
        "access-control-allow-methods": "GET,HEAD,PUT,POST,DELETE,PATCH",
        "access-control-allow-origin": "*",
        "content-security-policy": "default-src 'self';style-src 'self' https://fonts.googleapis.com;font-src 'self' https://fonts.gstatic.com;base-uri 'self';form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';upgrade-insecure-requests",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
        "origin-agent-cluster": "?1",
        "referrer-policy": "no-referrer",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "vary": "Origin",
        "x-content-type-options": "nosniff",
        "x-dns-prefetch-control": "off",
        "x-download-options": "noopen",
        "x-frame-options": "SAMEORIGIN",
        "x-permitted-cross-domain-policies": "none",
        "x-xss-protection": "0",
      }
    `);
  });
});

describe("createApp: request transaction", () => {
  it("runs a mutation in a savepoint of the request transaction and commits both", async () => {
    const { response, body } = await trpcMutation("write");
    expect(response.status).toBe(200);
    expect(superjson.deserialize(body.result.data)).toEqual({ trx: "1.1" });
    expect(knexFake.log).toEqual(["begin 1", "savepoint 1.1", "release 1.1", "commit 1"]);
  });

  // Under Koa, and before savepoints, both of these committed the failed
  // procedure's writes: tRPC turns the error into a response, so the request
  // transaction never saw it.
  it("rolls back the savepoint of a procedure that throws a TRPCError", async () => {
    const { response, body } = await trpcMutation("fail");
    expect({ status: response.status, code: body.error.json.data.code }).toEqual({
      status: 400,
      code: "BAD_REQUEST",
    });
    expect(knexFake.log).toEqual(["begin 1", "savepoint 1.1", "rollback to 1.1", "commit 1"]);
  });

  it("rolls back the savepoint of a procedure that throws an Error", async () => {
    const { response, body } = await trpcMutation("crash");
    expect({ status: response.status, code: body.error.json.data.code }).toEqual({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(knexFake.log).toEqual(["begin 1", "savepoint 1.1", "rollback to 1.1", "commit 1"]);
  });

  it("gives each procedure in a batch its own savepoint, run one after another", async () => {
    const { response, body } = await trpcMutation("write,fail,write?batch=1", {
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(207);
    const results = body as Array<{ result?: { data: unknown }; error?: unknown }>;
    expect(results.map((r) => (r.result ? superjson.deserialize(r.result.data as never) : "error")))
      .toEqual([{ trx: "1.1" }, "error", { trx: "1.3" }]);
    expect(knexFake.log).toEqual([
      "begin 1",
      "savepoint 1.1",
      "release 1.1",
      "savepoint 1.2",
      "rollback to 1.2",
      "savepoint 1.3",
      "release 1.3",
      "commit 1",
    ]);
  });
});

describe("createApp: simulateLatency", () => {
  it("delays responses by the configured number of milliseconds", async () => {
    const slow = createApp({ appApi, createContext, simulateLatency: 150 }).listen(0);
    const slowHost = await listen(slow);
    try {
      const started = performance.now();
      const response = await fetch(`http://${slowHost}/ping`);
      await response.text();
      expect(performance.now() - started).toBeGreaterThanOrEqual(140);
    } finally {
      await close(slow);
    }
  });
});

type SocketOutcome = { closed: boolean; code?: number; reason?: string; messages: string[] };

/** Opens a socket, optionally sends a first message, and reports what happened
 * within `waitMs`. */
async function socketOutcome(path: string, first: string | undefined, waitMs: number) {
  const socket = new WebSocket(`ws://${host}${path}`);
  const outcome: SocketOutcome = { closed: false, messages: [] };
  socket.on("message", (data) => outcome.messages.push(data.toString()));
  socket.on("close", (code, reason) => {
    outcome.closed = true;
    outcome.code = code;
    outcome.reason = reason.toString();
  });
  const opened = await new Promise<boolean>((resolve) => {
    socket.once("open", () => resolve(true));
    socket.once("error", () => resolve(false));
  });
  if (opened && first !== undefined) socket.send(first);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  socket.terminate();
  return { opened, ...outcome };
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("createApp: WebSocket", () => {
  it("authenticates with the first message, then delivers topic messages and pongs", async () => {
    const socket = new WebSocket(`ws://${host}/ws`);
    const messages: string[] = [];
    socket.on("message", (data) => messages.push(data.toString()));
    await new Promise((resolve) => socket.once("open", resolve));

    socket.send("good");
    await waitFor(() => registry.isTopicSubscribed("member:7"));

    registry.sendToTopic("member:7", "hello");
    socket.send("ping");
    await waitFor(() => messages.length === 2);
    expect(messages.sort()).toEqual(["hello", "pong"]);

    socket.close();
    await waitFor(() => !registry.isTopicSubscribed("member:7"));
  });

  it("does not open a request transaction for the socket", async () => {
    const socket = new WebSocket(`ws://${host}/ws`);
    await new Promise((resolve) => socket.once("open", resolve));
    socket.send("good");
    await waitFor(() => registry.isTopicSubscribed("member:7"));
    socket.close();
    await waitFor(() => !registry.isTopicSubscribed("member:7"));
    // Under Koa the upgrade ran inside dbMiddleware, holding a pooled connection
    // while waiting for the auth message. `authenticate` opens its own.
    expect(knexFake.log).toEqual([]);
  });

  // Under Koa the socket stayed open, unsubscribed, until the client left.
  it("closes a socket whose token is rejected with 4001", async () => {
    const outcome = await socketOutcome("/ws", "bad", 250);
    expect(registry.isTopicSubscribed("member:7")).toBe(false);
    expect(outcome).toEqual({
      opened: true,
      closed: true,
      code: 4001,
      reason: "Authentication failed",
      messages: [],
    });
  });

  it("closes a socket that never authenticates", async () => {
    const outcome = await socketOutcome("/ws", undefined, 250);
    expect(outcome).toMatchInlineSnapshot(`
      {
        "closed": true,
        "code": 1008,
        "messages": [],
        "opened": true,
        "reason": "Authentication timeout",
      }
    `);
  });

  it("records what happens to an upgrade request on another path", async () => {
    const outcome = await socketOutcome("/elsewhere", undefined, 250);
    expect(outcome).toMatchInlineSnapshot(`
      {
        "closed": true,
        "code": 1006,
        "messages": [],
        "opened": false,
        "reason": "",
      }
    `);
  });
});
