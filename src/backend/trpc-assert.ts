import { TRPCError } from "@trpc/server";

type TRPC_ERROR_CODE_KEY = ConstructorParameters<typeof TRPCError>[0]["code"];

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
