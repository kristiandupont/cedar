import * as jwt from "jsonwebtoken";
import type { IpString } from "narrow-types";

export function createSessionTokenHandler<
  TUser,
  TUserId extends string | number,
>(options: {
  jwtOptions: jwt.SignOptions;
  getSecret: () => Promise<string>;
  lookupUser: (memberId: TUserId) => Promise<TUser | undefined>;
  isAdmin?: (user: TUser) => boolean;
  getTokenVersion?: (user: TUser) => number;
}) {
  async function generateSessionToken(
    memberId: TUserId,
    clientIp: IpString | undefined,
    tokenVersion?: number,
  ): Promise<string> {
    const secret = await options.getSecret();
    return jwt.sign({ memberId, clientIp, tokenVersion }, secret, options.jwtOptions);
  }

  async function decodeAndVerifySessionToken(
    token: string,
    ipAddress: IpString | undefined,
  ): Promise<TUser | undefined> {
    const secret = await options.getSecret();
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & {
      memberId: TUserId;
      clientIp: IpString;
      tokenVersion?: number;
    };

    const { memberId, clientIp, tokenVersion } = decoded;
    const user = await options.lookupUser(memberId);

    if (!user) return undefined;

    if (options.getTokenVersion && tokenVersion !== options.getTokenVersion(user)) {
      return undefined;
    }

    if (options.isAdmin?.(user) && ipAddress && clientIp !== ipAddress) {
      return undefined;
    }

    return user;
  }

  return { generateSessionToken, decodeAndVerifySessionToken };
}
