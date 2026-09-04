import * as jwt from "jsonwebtoken";
import { EmailString, IpString } from "narrow-types";
//#region src/auth/jwt.d.ts
export declare function createSessionTokenHandler<TUser, TUserId extends string | number>(options: {
  jwtOptions: jwt.SignOptions;
  getSecret: () => Promise<string>;
  lookupUser: (memberId: TUserId) => Promise<TUser | undefined>;
  isAdmin?: (user: TUser) => boolean;
  getTokenVersion?: (user: TUser) => number;
}): {
  generateSessionToken: (memberId: TUserId, clientIp: IpString | undefined, tokenVersion?: number) => Promise<string>;
  decodeAndVerifySessionToken: (token: string, ipAddress: IpString | undefined) => Promise<TUser | undefined>;
};
//#endregion
//#region src/auth/login-token.d.ts
export declare function createLoginTokenHandler(options: {
  getSecret: () => Promise<string>;
}): {
  createLoginToken: (email: EmailString) => Promise<string>;
  extractEmailFromToken: (token: string) => Promise<EmailString>;
};
//#endregion
//# sourceMappingURL=auth.d.cts.map