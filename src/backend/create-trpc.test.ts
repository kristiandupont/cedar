import { describe, expect, it, vi } from "vitest";

import { buildContext } from "./create-trpc";

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    headers: {
      authorization: undefined as string | undefined,
      origin: undefined as string | undefined,
      "x-workspace-version": undefined as string | undefined,
      ...overrides,
    },
    socket: { remoteAddress: "127.0.0.1" },
    connection: { remoteAddress: "127.0.0.1" },
  };
}

describe("buildContext", () => {
  it("returns undefined user when no authorization header", async () => {
    const decodeSessionToken = vi.fn();
    const createContext = buildContext({ decodeSessionToken });
    const ctx = await createContext({ req: makeReq() as any, res: {} as any });

    expect(ctx.user).toBeUndefined();
    expect(decodeSessionToken).not.toHaveBeenCalled();
  });

  it("decodes user from bearer token", async () => {
    const fakeUser = { id: 42, name: "Alice" };
    const decodeSessionToken = vi.fn().mockResolvedValue(fakeUser);
    const createContext = buildContext({ decodeSessionToken });

    const ctx = await createContext({
      req: makeReq({ authorization: "Bearer my-token" }) as any,
      res: {} as any,
    });

    expect(ctx.user).toEqual(fakeUser);
    expect(decodeSessionToken).toHaveBeenCalledWith(
      "my-token",
      expect.anything(),
    );
  });

  it("returns undefined user when token decode returns undefined", async () => {
    const decodeSessionToken = vi.fn().mockResolvedValue(undefined);
    const createContext = buildContext({ decodeSessionToken });

    const ctx = await createContext({
      req: makeReq({ authorization: "Bearer bad-token" }) as any,
      res: {} as any,
    });

    expect(ctx.user).toBeUndefined();
  });

  it("captures origin header", async () => {
    const createContext = buildContext({ decodeSessionToken: vi.fn() });
    const ctx = await createContext({
      req: makeReq({ origin: "https://example.com" }) as any,
      res: {} as any,
    });

    expect(ctx.origin).toBe("https://example.com");
  });

  it("parses workspaceVersion from x-workspace-version header", async () => {
    const date = new Date("2024-01-15T10:00:00.000Z");
    const createContext = buildContext({ decodeSessionToken: vi.fn() });
    const ctx = await createContext({
      req: makeReq({ "x-workspace-version": date.toISOString() }) as any,
      res: {} as any,
    });

    expect(ctx.workspaceVersion).toEqual(date);
  });

  it("returns undefined workspaceVersion for invalid date string", async () => {
    const createContext = buildContext({ decodeSessionToken: vi.fn() });
    const ctx = await createContext({
      req: makeReq({ "x-workspace-version": "not-a-date" }) as any,
      res: {} as any,
    });

    expect(ctx.workspaceVersion).toBeUndefined();
  });
});
