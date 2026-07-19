import { IpString } from "narrow-types";
import { Options, Options as CorsOptions } from "@koa/cors";
import { AnyRouter, TRPCError, TRPCError as TRPCError$1, inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import * as Koa$1 from "koa";
import Koa from "koa";
import { CreateTrpcKoaContextOptions } from "trpc-koa-adapter";
import superjson from "superjson";
import { AsyncLocalStorage } from "node:async_hooks";
import { Knex } from "knex";

//#region src/backend/create-app.d.ts
declare function createApp(options: {
  corsConfig?: Options;
  appApi: AnyRouter;
  createContext: (opts: CreateTrpcKoaContextOptions) => Promise<unknown>;
  wsHandler?: Koa.Middleware;
  simulateLatency?: number;
}): Koa;
//#endregion
//#region src/backend/create-trpc.d.ts
type BaseContext<TUser> = {
  user: TUser | undefined;
  clientIp: IpString | undefined;
  origin: string | undefined;
  workspaceVersion: Date | undefined;
};
declare const trpcConfig: {
  readonly transformer: typeof superjson;
};
declare function buildContext<TUser extends {
  id: string | number;
}>(config: {
  decodeSessionToken: (token: string, ip: IpString | undefined) => Promise<TUser | undefined>;
}): ({
  req
}: CreateTrpcKoaContextOptions) => Promise<BaseContext<TUser>>;
//#endregion
//#region src/backend/db.d.ts
type DbStore = {
  db: Knex;
  trx?: Knex.Transaction;
};
declare global {
  var __cedarDbStorage: AsyncLocalStorage<DbStore> | undefined;
}
declare function initDb(config: Knex.Config): void;
declare const getDb: () => Knex;
declare const getTrx: () => Knex.Transaction;
declare const dbMiddleware: Koa$1.Middleware;
declare function wrapInTransaction<A extends Array<unknown>, R>(callback: (...args: A) => Promise<R>, db?: Knex): (...args: A) => Promise<R>;
//#endregion
//#region src/backend/trpc-assert.d.ts
type TRPC_ERROR_CODE_KEY = ConstructorParameters<typeof TRPCError$1>[0]["code"];
declare function trpcAssert(condition: unknown, msg: string, code?: TRPC_ERROR_CODE_KEY): asserts condition;
//#endregion
//#region src/backend/poke-workspace.d.ts
/**
 * The Postgres NOTIFY channel every app instance LISTENs on for workspace
 * changes. The payload is the typed anchor only — `{ type, id }` — never row
 * data: NOTIFY caps at 8 kB, and a poked client pulls the delta itself anyway.
 */
declare const WORKSPACE_CHANGED_CHANNEL = "workspace_changed";
type WorkspacePokePayload = {
  type: string;
  id: string | number;
};
/**
 * Announce that the workspace anchored on `${anchorType}:${anchorId}` changed,
 * so connected clients pull a fresh delta. This is the app-level poke: it is
 * called by the code that performs a write, not by a database trigger.
 *
 * Two things make it correct across a fleet:
 *
 * - **Transport, not source.** It emits a Postgres NOTIFY, so the write's
 *   instance and the client's instance need not be the same — every instance
 *   LISTENs and pokes its own sockets (see `establishDbListener` /
 *   `bridgeWorkspacePokesToSockets`). Single-instance collapses to the same
 *   path (the one instance hears its own notify).
 * - **Rides the transaction.** It runs on the current request/job transaction
 *   (`getTrx`), so Postgres buffers the NOTIFY until commit: clients are told to
 *   pull only once the change is durably visible, and a rolled-back write pokes
 *   no one. Call it from within the same transaction as the write.
 *
 * Coalesce to one call per unit of work (e.g. one per job, not one per row):
 * the delta pull reflects everything since the client's version regardless, and
 * the listener debounces per key on top of that.
 */
declare function pokeWorkspace(anchorType: string, anchorId: string | number): Promise<void>;
//#endregion
//#region src/backend/socket-registry.d.ts
type Logger$1 = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};
interface SocketRegistry {
  /** Koa middleware handling `GET /ws`: authenticate, subscribe, keep alive. */
  wsHandler: Koa$1.Middleware;
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
declare function createSocketRegistry<TMember>(options: {
  /** Verify the session token (first ws message) and return the member, or
   * undefined to reject. Runs where DB access is set up — the app wraps its
   * token decode in a transaction. */
  authenticate: (token: string, clientIp: IpString | undefined) => Promise<TMember | undefined>;
  /** The topics this identity may receive on. Evaluated once at connect; a
   * mid-session role change takes effect on reconnect. */
  resolveSubscriptions: (member: TMember) => string[];
  logger?: Logger$1; /** How long to wait for the auth message before closing. Default 5 s. */
  authTimeoutMs?: number;
}): SocketRegistry;
//#endregion
//#region src/backend/db-listener.d.ts
type Logger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};
interface DbListener {
  /** Dispatches one event per channel, named for the channel, with the parsed
   * NOTIFY payload on `event.detail`. */
  target: EventTarget;
  close: () => Promise<void>;
}
/**
 * Bridges Postgres `LISTEN/NOTIFY` to an `EventTarget`, generalized from
 * Beatpoints' single-`chat`-channel listener. Each instance runs one of these
 * and subscribes its own sockets, which is what makes pokes cross-instance: a
 * write on any instance NOTIFYs, and every instance hears it.
 *
 * Pokes are best-effort — a `pg-listen` reconnect drops notifications in its
 * gap — so a client's fallback poll is the correctness backstop, not this.
 */
declare function establishDbListener(connectionString: string, channels: string[], logger?: Logger): Promise<DbListener>;
/**
 * Wires the `workspace_changed` channel to the socket registry: on a poke, fan
 * out to whichever sockets subscribe to that anchor's topic. The message
 * **names its anchor** (`anchor: "{type}:{id}"`) so a socket holding several
 * workspaces pulls only the one that changed.
 *
 * Debounced per anchor key: a burst of writes to one workspace (a bulk job)
 * yields a single poke, since the client pulls the whole delta since its version
 * regardless of how many writes triggered it. Returns an unsubscribe function.
 */
declare function bridgeWorkspacePokesToSockets(options: {
  target: EventTarget;
  sendToTopic: (topic: string, payloadString: string) => void;
  debounceMs?: number;
}): () => void;
//#endregion
export { type BaseContext, type CorsOptions, type DbListener, type SocketRegistry, TRPCError, WORKSPACE_CHANGED_CHANNEL, type WorkspacePokePayload, bridgeWorkspacePokesToSockets, buildContext, createApp, createSocketRegistry, dbMiddleware, establishDbListener, getDb, getTrx, type inferRouterInputs, type inferRouterOutputs, initDb, pokeWorkspace, trpcAssert, trpcConfig, wrapInTransaction };
//# sourceMappingURL=backend.d.cts.map