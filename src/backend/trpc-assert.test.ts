import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import trpcAssert from "./trpc-assert";

describe("trpcAssert", () => {
  it("does not throw when condition is truthy", () => {
    expect(() => trpcAssert(true, "message")).not.toThrow();
    expect(() => trpcAssert(1, "message")).not.toThrow();
    expect(() => trpcAssert("value", "message")).not.toThrow();
    expect(() => trpcAssert({}, "message")).not.toThrow();
  });

  it("throws TRPCError when condition is falsy", () => {
    expect(() => trpcAssert(false, "something went wrong")).toThrow(TRPCError);
    expect(() => trpcAssert(null, "something went wrong")).toThrow(TRPCError);
    expect(() => trpcAssert(undefined, "something went wrong")).toThrow(
      TRPCError,
    );
    expect(() => trpcAssert(0, "something went wrong")).toThrow(TRPCError);
  });

  it("uses INTERNAL_SERVER_ERROR as default code", () => {
    let caught: TRPCError | undefined;
    try {
      trpcAssert(false, "oops");
    } catch (e) {
      caught = e as TRPCError;
    }
    expect(caught?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(caught?.message).toBe("oops");
  });

  it("uses the provided error code", () => {
    let caught: TRPCError | undefined;
    try {
      trpcAssert(false, "not allowed", "UNAUTHORIZED");
    } catch (e) {
      caught = e as TRPCError;
    }
    expect(caught?.code).toBe("UNAUTHORIZED");
  });

  it("narrows type after truthy assertion", () => {
    const value: string | undefined = "hello";
    trpcAssert(value, "should not throw");
    // TypeScript should narrow value to string here
    const upper: string = value.toUpperCase();
    expect(upper).toBe("HELLO");
  });
});
