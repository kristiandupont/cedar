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

    let decoded: jwt.JwtPayload & {
      memberId: TUserId;
      clientIp: IpString;
      tokenVersion?: number;
    };
    try {
      decoded = jwt.verify(token, secret) as typeof decoded;
    } catch (error) {
      // An expired, tampered, or otherwise malformed token is not an
      // authenticated request — it is not a server fault. Return undefined so
      // the caller treats it as "not logged in" (a clean UNAUTHORIZED) rather
      // than letting the throw bubble up and become a 500 at context creation.
      if (error instanceof jwt.JsonWebTokenError) {
        return undefined;
      }
      throw error;
    }

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
