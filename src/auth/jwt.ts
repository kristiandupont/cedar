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
}) {
  async function generateSessionToken(
    memberId: TUserId,
    clientIp: IpString | undefined,
  ): Promise<string> {
    const secret = await options.getSecret();
    return jwt.sign({ memberId, clientIp }, secret, options.jwtOptions);
  }

  async function decodeAndVerifySessionToken(
    token: string,
    ipAddress: IpString | undefined,
  ): Promise<TUser | undefined> {
    const secret = await options.getSecret();
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & {
      memberId: TUserId;
      clientIp: IpString;
    };

    const { memberId, clientIp } = decoded;
    const user = await options.lookupUser(memberId);

    if (
      user &&
      options.isAdmin?.(user) &&
      ipAddress &&
      clientIp !== ipAddress
    ) {
      return undefined;
    }

    return user;
  }

  return { generateSessionToken, decodeAndVerifySessionToken };
}
