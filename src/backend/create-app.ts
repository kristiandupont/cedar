import { setTimeout } from "node:timers/promises";

import type { Options as CorsOptions } from "@koa/cors";
import cors from "@koa/cors";
import Router from "@koa/router";
import type { AnyRouter } from "@trpc/server";
import Koa from "koa";
import websocket from "koa-easy-ws";
import type koaHelmet from "koa-helmet";
import helmet from "koa-helmet";
import koaLogger from "koa-logger";
import { createKoaMiddleware } from "trpc-koa-adapter";
import type { CreateTrpcKoaContextOptions } from "trpc-koa-adapter";

import { dbMiddleware } from "./db";

type HelmetConfig = Parameters<typeof koaHelmet>[0];

export function createApp(options: {
  helmetConfig: HelmetConfig;
  corsConfig: CorsOptions;
  appApi: AnyRouter;
  createContext: (opts: CreateTrpcKoaContextOptions) => Promise<unknown>;
  wsHandler?: Koa.Middleware;
  simulateLatency?: number;
}): Koa {
  const { helmetConfig, corsConfig, appApi, createContext, wsHandler, simulateLatency } =
    options;

  const app = new Koa();

  app.use(websocket());
  app.use(helmet(helmetConfig));
  app.use(cors(corsConfig));
  app.use(dbMiddleware);
  app.use(koaLogger());

  if (simulateLatency) {
    app.use(async (_ctx, next) => {
      await next();
      await setTimeout(simulateLatency);
    });
  }

  const router = new Router();
  router.get("/ping", async (ctx) => (ctx.body = "pong"));

  if (wsHandler) {
    router.get("/ws", wsHandler);
  }

  app.use(router.routes());
  app.use(router.allowedMethods());

  app.use(
    createKoaMiddleware({
      router: appApi,
      prefix: "/trpc",
      createContext,
    }),
  );

  return app;
}
