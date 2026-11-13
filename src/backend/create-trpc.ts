import type { IncomingMessage, ServerResponse } from "node:http";

import type { DefaultErrorShape, TRPCError } from "@trpc/server";
import type { NodeHTTPCreateContextFnOptions } from "@trpc/server/adapters/node-http";
import type { IpString } from "narrow-types";
import { ipString } from "narrow-types";
import { getClientIp } from "request-ip";
import superjson from "superjson";

/** What tRPC passes to `createContext` for each HTTP request. */
export type CreateContextOptions = NodeHTTPCreateContextFnOptions<
  IncomingMessage,
  ServerResponse
>;

export type BaseContext<TUser> = {
  user: TUser | undefined;
  clientIp: IpString | undefined;
  origin: string | undefined;
  workspaceVersion: Date | undefined;
};

/** The message sent to clients for every `INTERNAL_SERVER_ERROR`. */
export const internalErrorMessage = "Internal server error";

/**
 * Keeps server-side details out of error responses. tRPC always sends
 * `error.message`, and for an unexpected exception (anything that is not a
 * `TRPCError`) that is the exception's own message: for a Knex/Postgres error,
 * the SQL text and the database error. Every `INTERNAL_SERVER_ERROR` therefore
 * gets a generic message; `createApp` logs the original on the server.
 *
 * Other codes are deliberate (`trpcAssert(row, "Not found", "NOT_FOUND")`,
 * input validation) and keep their message. tRPC adds `data.stack` only when
 * `NODE_ENV` is not "production".
 */
function errorFormatter({
  shape,
  error,
}: {
  shape: DefaultErrorShape;
  error: TRPCError;
}): DefaultErrorShape {
  if (error.code !== "INTERNAL_SERVER_ERROR") return shape;
  return { ...shape, message: internalErrorMessage };
}

export const trpcConfig = { transformer: superjson, errorFormatter } as const;

export function buildContext<TUser extends { id: string | number }>(config: {
  decodeSessionToken: (
    token: string,
    ip: IpString | undefined,
  ) => Promise<TUser | undefined>;
}) {
  return async function createContext({
    req,
  }: CreateContextOptions): Promise<BaseContext<TUser>> {
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
  };
}
