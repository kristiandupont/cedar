import { setTimeout } from "node:timers/promises";

import type { Options as CorsOptions } from "@koa/cors";
import cors from "@koa/cors";
import Router from "@koa/router";
import type { AnyRouter } from "@trpc/server";
import Koa from "koa";
import websocket from "koa-easy-ws";
import helmet from "koa-helmet";
import koaLogger from "koa-logger";
import { createKoaMiddleware } from "trpc-koa-adapter";
import type { CreateTrpcKoaContextOptions } from "trpc-koa-adapter";

import { dbMiddleware } from "./db";

export type { Options as CorsOptions } from "@koa/cors";

const defaultHelmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    },
  },
};

export function createApp(options: {
  corsConfig?: CorsOptions;
  appApi: AnyRouter;
  createContext: (opts: CreateTrpcKoaContextOptions) => Promise<unknown>;
  wsHandler?: Koa.Middleware;
  simulateLatency?: number;
}): Koa {
  const { corsConfig = {}, appApi, createContext, wsHandler, simulateLatency } =
    options;

  const app = new Koa();

  app.use(websocket());
  app.use(helmet(defaultHelmetConfig));
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
