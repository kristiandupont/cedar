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
export { type BaseContext, type CorsOptions, TRPCError, buildContext, createApp, dbMiddleware, getDb, getTrx, type inferRouterInputs, type inferRouterOutputs, initDb, trpcAssert, trpcConfig, wrapInTransaction };
//# sourceMappingURL=backend.d.cts.map