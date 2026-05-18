import { initTRPC } from "@trpc/server";
import type { IpString } from "narrow-types";
import { ipString } from "narrow-types";
import { getClientIp } from "request-ip";
import superjson from "superjson";
import type { CreateTrpcKoaContextOptions } from "trpc-koa-adapter";
import { z } from "zod";

import { getWorkspaceDelta, type WorkspaceDelta, type WorkspaceDefinition } from "workspace-sync";

import { getTrx } from "./db";
import trpcAssert from "./trpc-assert";

export type BaseContext<TUser> = {
  user: TUser | undefined;
  clientIp: IpString | undefined;
  origin: string | undefined;
  workspaceVersion: Date | undefined;
};

export function createTrpc<TUser extends { id: string | number }>(config: {
  workspaceDefinition: WorkspaceDefinition;
  decodeSessionToken: (
    token: string,
    ip: IpString | undefined,
  ) => Promise<TUser | undefined>;
}) {
  type Context = BaseContext<TUser>;

  async function createContext({
    req,
  }: CreateTrpcKoaContextOptions): Promise<Context> {
    const r = ipString.safeParse(getClientIp(req));
    const clientIp = r.success ? r.data : undefined;

    let user: TUser | undefined;
    if (req.headers.authorization) {
      user = await config.decodeSessionToken(
        req.headers.authorization.split(" ")[1],
        clientIp,
      );
    }

    const origin = req.headers.origin;

    let workspaceVersion: Date | undefined;
    const versionHeader = req.headers["x-workspace-version"];
    if (typeof versionHeader === "string") {
      const parsed = new Date(versionHeader);
      if (!isNaN(parsed.getTime())) {
        workspaceVersion = parsed;
      }
    }

    return { user, clientIp, origin, workspaceVersion };
  }

  const t = initTRPC.context<Context>().create({ transformer: superjson });

  const isAuthenticated = t.middleware(({ ctx, next }) => {
    trpcAssert(ctx.user, "UNAUTHORIZED");
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });

  const router = t.router;
  const mergeRouters = t.mergeRouters;
  const publicProcedure = t.procedure;
  const protectedProcedure = publicProcedure.use(isAuthenticated);
  const middleware = t.middleware;
  const createCallerFactory = t.createCallerFactory;

  const protectedMutationWithDelta = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    input: <TInputSchema extends z.ZodTypeAny>(inputSchema: TInputSchema) => {
      type TInput = z.infer<TInputSchema>;
      const builder = {
        output: <TOutputSchema extends z.ZodTypeAny>(
          dataOutputSchema: TOutputSchema,
        ) => ({
          mutation: <TOutput extends z.infer<TOutputSchema>>(
            handler: (opts: {
              ctx: Omit<Context, "user"> & { user: TUser };
              input: TInput;
            }) => Promise<TOutput>,
          ) => {
            const wrappedOutputSchema = z.object({
              data: dataOutputSchema,
              delta: z.custom<WorkspaceDelta>(() => true),
            });

            return protectedProcedure
              .input(inputSchema)
              .output(wrappedOutputSchema)
              .mutation(async (opts) => {
                const data = await handler({
                  ...opts,
                  input: opts.input as TInput,
                });

                const trx = getTrx();
                const since = opts.ctx.workspaceVersion ?? new Date(0);
                const delta = await getWorkspaceDelta(
                  trx,
                  config.workspaceDefinition,
                  opts.ctx.user!.id,
                  since,
                );

                return { data, delta };
              });
          },
        }),
        mutation: <TOutput>(
          handler: (opts: {
            ctx: Omit<Context, "user"> & { user: TUser };
            input: TInput;
          }) => Promise<TOutput>,
        ) =>
          protectedProcedure.input(inputSchema).mutation(async (opts) => {
            const data = await handler({
              ...opts,
              input: opts.input as TInput,
            });

            const trx = getTrx();
            const since = opts.ctx.workspaceVersion ?? new Date(0);
            const delta = await getWorkspaceDelta(
              trx,
              config.workspaceDefinition,
              opts.ctx.user!.id,
              since,
            );

            return { data, delta };
          }),
      };
      return builder;
    },
  };

  return {
    createContext,
    router,
    mergeRouters,
    publicProcedure,
    protectedProcedure,
    protectedMutationWithDelta,
    middleware,
    createCallerFactory,
  };
}
