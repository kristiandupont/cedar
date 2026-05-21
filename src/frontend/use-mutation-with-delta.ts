/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UseTRPCMutationResult } from "@trpc/react-query/shared";
import type { WorkspaceDelta } from "workspace-sync";

export function useMutationWithDelta<TData, TError, TVariables, TContext>(
  mutation: UseTRPCMutationResult<
    { data: TData; delta: WorkspaceDelta },
    TError,
    TVariables,
    TContext
  >,
  applyDelta: (delta: WorkspaceDelta) => void,
): Omit<
  UseTRPCMutationResult<TData, TError, TVariables, TContext>,
  "mutate" | "mutateAsync" | "data"
> & {
  mutate: (
    variables: TVariables,
    options?: Parameters<
      UseTRPCMutationResult<TData, TError, TVariables, TContext>["mutate"]
    >[1],
  ) => void;
  mutateAsync: (
    variables: TVariables,
    options?: Parameters<
      UseTRPCMutationResult<TData, TError, TVariables, TContext>["mutateAsync"]
    >[1],
  ) => Promise<TData>;
  data: TData | undefined;
} {
  return {
    ...mutation,
    data: mutation.data?.data,
    mutate: (variables, options) => {
      mutation.mutate(variables, {
        ...options,
        onSuccess: (
          data: { data: TData; delta: WorkspaceDelta },
          vars: TVariables,
          ctx: TContext,
        ) => {
          applyDelta(data.delta);
          options?.onSuccess?.(data.data, vars, ctx);
        },
      } as any);
    },
    mutateAsync: async (variables, options) => {
      const result = await mutation.mutateAsync(variables, options as any);
      applyDelta(result.delta);
      return result.data;
    },
  };
}
