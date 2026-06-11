import { describe, expect, it } from "vitest";

import { createSessionTokenHandler } from "./jwt";

const secret = "test-secret-key";
const getSecret = async () => secret;

type User = { id: number; name: string };
const users: Record<number, User> = {
  1: { id: 1, name: "Alice" },
  2: { id: 2, name: "Bob" },
};

function makeHandler(isAdmin?: (u: User) => boolean) {
  return createSessionTokenHandler<User, number>({
    jwtOptions: { expiresIn: "1h" },
    getSecret,
    lookupUser: async (id) => users[id],
    isAdmin,
  });
}

describe("createSessionTokenHandler", () => {
  it("generate + decode round-trip returns the correct user", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } = makeHandler();

    const token = await generateSessionToken(1, undefined);
    const user = await decodeAndVerifySessionToken(token, undefined);

    expect(user).toEqual({ id: 1, name: "Alice" });
  });

  it("returns undefined for an unknown user id in the token", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } = makeHandler();

    const token = await generateSessionToken(999 as any, undefined);
    const user = await decodeAndVerifySessionToken(token, undefined);

    expect(user).toBeUndefined();
  });

  it("returns undefined for a tampered token", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } = makeHandler();

    const token = await generateSessionToken(1, undefined);
    const tampered = token.slice(0, -5) + "XXXXX";

    const user = await decodeAndVerifySessionToken(tampered, undefined);

    expect(user).toBeUndefined();
  });

  it("returns undefined for an expired token", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } =
      createSessionTokenHandler<User, number>({
        jwtOptions: { expiresIn: "-1s" },
        getSecret,
        lookupUser: async (id) => users[id],
      });

    const token = await generateSessionToken(1, undefined);
    const user = await decodeAndVerifySessionToken(token, undefined);

    expect(user).toBeUndefined();
  });

  it("returns undefined for a malformed token", async () => {
    const { decodeAndVerifySessionToken } = makeHandler();

    const user = await decodeAndVerifySessionToken("not-a-jwt", undefined);

    expect(user).toBeUndefined();
  });

  it("returns undefined for admin user with mismatched IP", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } = makeHandler(
      () => true,
    );

    const token = await generateSessionToken(1, "1.2.3.4" as any);
    const user = await decodeAndVerifySessionToken(token, "9.9.9.9" as any);

    expect(user).toBeUndefined();
  });

  it("returns user for admin with matching IP", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } = makeHandler(
      () => true,
    );

    const token = await generateSessionToken(1, "1.2.3.4" as any);
    const user = await decodeAndVerifySessionToken(token, "1.2.3.4" as any);

    expect(user).toEqual({ id: 1, name: "Alice" });
  });

  it("does not check IP for non-admin users", async () => {
    const { generateSessionToken, decodeAndVerifySessionToken } = makeHandler(
      () => false,
    );

    const token = await generateSessionToken(1, "1.2.3.4" as any);
    const user = await decodeAndVerifySessionToken(token, "9.9.9.9" as any);

    expect(user).toEqual({ id: 1, name: "Alice" });
  });
});
