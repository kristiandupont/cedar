import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/dist/rpc";

function trpcAssert(
  condition: unknown,
  msg: string,
  code: TRPC_ERROR_CODE_KEY = "INTERNAL_SERVER_ERROR",
): asserts condition {
  if (!condition) {
    throw new TRPCError({ code, message: msg });
  }
}

export default trpcAssert;
