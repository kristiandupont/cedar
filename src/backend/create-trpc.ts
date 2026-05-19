import type { IpString } from "narrow-types";
import { ipString } from "narrow-types";
import { getClientIp } from "request-ip";
import superjson from "superjson";
import type { CreateTrpcKoaContextOptions } from "trpc-koa-adapter";

export type BaseContext<TUser> = {
  user: TUser | undefined;
  clientIp: IpString | undefined;
  origin: string | undefined;
  workspaceVersion: Date | undefined;
};

export const trpcConfig = { transformer: superjson } as const;

export function buildContext<TUser extends { id: string | number }>(config: {
  decodeSessionToken: (
    token: string,
    ip: IpString | undefined,
  ) => Promise<TUser | undefined>;
}) {
  return async function createContext({
    req,
  }: CreateTrpcKoaContextOptions): Promise<BaseContext<TUser>> {
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
