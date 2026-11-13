import { TRPCError } from "@trpc/server";

type TRPC_ERROR_CODE_KEY = ConstructorParameters<typeof TRPCError>[0]["code"];

/**
 * Throws a `TRPCError` with `code` (default `INTERNAL_SERVER_ERROR`) when
 * `condition` is falsy.
 *
 * The message comes before the code, and passing an error code as the message
 * is a type error: `trpcAssert(row, "NOT_FOUND")` would otherwise compile and
 * return a 500 whose message is "NOT_FOUND". Write
 * `trpcAssert(row, "Row not found", "NOT_FOUND")`.
 */
function trpcAssert<M extends string>(
  condition: unknown,
  // `M &` lets TypeScript infer M from the argument; the conditional then
  // reduces the parameter type to `never` when M is one of the error codes.
  msg: M & (M extends TRPC_ERROR_CODE_KEY ? never : unknown),
  code: TRPC_ERROR_CODE_KEY = "INTERNAL_SERVER_ERROR",
): asserts condition {
  if (!condition) {
    throw new TRPCError({ code, message: msg });
  }
}

export default trpcAssert;
