import type * as Koa from "koa";
import type { IpString } from "narrow-types";
import { ipString } from "narrow-types";
import { getClientIp } from "request-ip";
import type { WebSocket } from "ws";

// koa-easy-ws augments the request context with `ws()` only inside its own
// middleware's context type, not globally, so name the shape we rely on here.
type WsContext = Koa.Context & { ws: () => Promise<WebSocket> };

type Logger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const noopLogger: Logger = { info: () => {}, error: () => {} };

export interface SocketRegistry {
  /** Koa middleware handling `GET /ws`: authenticate, subscribe, keep alive. */
  wsHandler: Koa.Middleware;
  /** Send to every socket subscribed to `topic`. A no-op with no subscribers —
   * that is normal for a poke to a topic nobody is currently watching. */
  sendToTopic(topic: string, payloadString: string): void;
  /** Whether any socket is currently subscribed to `topic`. Lets a caller
   * branch (e.g. chat: push a notification when the member is offline). */
  isTopicSubscribed(topic: string): boolean;
  /** Send to every connected socket exactly once, regardless of its topics. */
  broadcast(payloadString: string): void;
}

/**
 * The shared socket registry both apps run. Sockets are keyed by **topic**, not
 * by member: `member:{id}` (chat) and `anchor:{type}:{id}` (workspace) are just
 * topics, and one socket may hold several. On connect, after token auth, the
 * app decides the socket's topics via `resolveSubscriptions(member)` — that is
 * where "admin ⇒ user + admin workspaces" or "member ⇒ their org's workspace"
 * is expressed. Because subscriptions are derived from the authenticated
 * identity server-side, there is no client-asserted-topic attack surface.
 *
 * Membership uses `Map`/`Set` operations throughout. The registry this replaces
 * tested `member.id in wsMap` — `in` checks object properties, not `Map`
 * entries, so it was always false and every reconnect orphaned the member's
 * other tabs. That silent bug must not recur here.
 */
export function createSocketRegistry<TMember>(options: {
  /** Verify the session token (first ws message) and return the member, or
   * undefined to reject. Runs where DB access is set up — the app wraps its
   * token decode in a transaction. */
  authenticate: (
    token: string,
    clientIp: IpString | undefined,
  ) => Promise<TMember | undefined>;
  /** The topics this identity may receive on. Evaluated once at connect; a
   * mid-session role change takes effect on reconnect. */
  resolveSubscriptions: (member: TMember) => string[];
  logger?: Logger;
  /** How long to wait for the auth message before closing. Default 5 s. */
  authTimeoutMs?: number;
}): SocketRegistry {
  const {
    authenticate,
    resolveSubscriptions,
    logger = noopLogger,
    authTimeoutMs = 5000,
  } = options;

  // topic -> (socket id -> socket). A socket appears under each of its topics.
  const byTopic = new Map<string, Map<symbol, WebSocket>>();
  // Every live socket, once, so `broadcast` never double-sends to a socket that
  // holds multiple topics.
  const allSockets = new Map<symbol, WebSocket>();

  function subscribe(id: symbol, socket: WebSocket, topics: string[]): void {
    allSockets.set(id, socket);
    for (const topic of topics) {
      let sockets = byTopic.get(topic);
      if (!sockets) {
        sockets = new Map();
        byTopic.set(topic, sockets);
      }
      sockets.set(id, socket);
    }
  }

  function unsubscribe(id: symbol, topics: string[]): void {
    allSockets.delete(id);
    for (const topic of topics) {
      const sockets = byTopic.get(topic);
      if (!sockets) continue;
      sockets.delete(id);
      if (sockets.size === 0) byTopic.delete(topic);
    }
  }

  function sendToTopic(topic: string, payloadString: string): void {
    const sockets = byTopic.get(topic);
    if (!sockets || sockets.size === 0) return;
    for (const socket of sockets.values()) socket.send(payloadString);
  }

  function isTopicSubscribed(topic: string): boolean {
    const sockets = byTopic.get(topic);
    return sockets !== undefined && sockets.size > 0;
  }

  function broadcast(payloadString: string): void {
    for (const socket of allSockets.values()) socket.send(payloadString);
  }

  const wsHandler: Koa.Middleware = async (ctx, next) => {
    const parsedIp = ipString.safeParse(getClientIp(ctx.req));
    const clientIp = parsedIp.success ? parsedIp.data : undefined;

    const socket = await (ctx as WsContext).ws();

    // The first message must be the session token, or we close.
    const member = await new Promise<TMember | undefined>((resolve) => {
      const timer = setTimeout(() => {
        socket.close(1008, "Authentication timeout");
        resolve(undefined);
      }, authTimeoutMs);

      socket.once("message", (inputBuffer: Buffer) => {
        clearTimeout(timer);
        const token = inputBuffer.toString("utf8");
        void authenticate(token, clientIp).then(resolve);
      });

      socket.once("close", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
    });

    if (!member) {
      ctx.body = "OK";
      await next();
      return;
    }

    const id = Symbol();
    const topics = resolveSubscriptions(member);

    socket.on("error", (err: unknown) => {
      logger.error("Socket error", err);
    });

    socket.on("close", () => {
      unsubscribe(id, topics);
    });

    // Keep-alive: the client pings, we pong. Everything else it may send is
    // ignored — the registry pushes, it does not take commands.
    socket.on("message", (inputBuffer: Buffer) => {
      if (inputBuffer.toString("utf8") === "ping") socket.send("pong");
    });

    subscribe(id, socket, topics);

    ctx.body = "OK";
    await next();
  };

  return { wsHandler, sendToTopic, isTopicSubscribed, broadcast };
}
