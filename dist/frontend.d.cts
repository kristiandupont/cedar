/// <reference types="react" />
import { AnyProcedure, AnyQueryProcedure, AnyRouter, DeepPartial, Filter, ProtectedIntersection, inferProcedureInput } from "@trpc/server";
import { ComponentProps, ComponentType, FC, ReactNode } from "react";
import { CancelOptions, DehydratedState, FetchInfiniteQueryOptions, FetchQueryOptions, InfiniteData, InvalidateOptions, InvalidateQueryFilters, Query, QueryClient, QueryKey, RefetchOptions, RefetchQueryFilters, ResetOptions, SetDataOptions, Updater, UseBaseQueryOptions, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { CreateTRPCClientOptions, CreateTRPCProxyClient, TRPCClient, TRPCClientError, TRPCRequestOptions } from "@trpc/client";
import { inferTransformedProcedureOutput } from "@trpc/server/shared";
import { WorkspaceDelta, workspaceVersionRef } from "workspace-sync";
import { UseTRPCMutationResult } from "@trpc/react-query/shared";

//#region src/frontend/combine-wrappers.d.ts
interface WrapperItem {
  Wrapper: ComponentType<any>;
  props: any;
}
declare const wrp: <T extends ComponentType<any>>(Wrapper: T, props?: Omit<ComponentProps<T>, "children"> | undefined) => WrapperItem;
declare const combineWrappers: (displayName: string, wrappers: WrapperItem[]) => FC<{
  children: ReactNode | null;
}>;
//#endregion
//#region node_modules/@trpc/react-query/dist/internals/context.d.ts
interface TRPCFetchQueryOptions<TInput, TError, TOutput> extends FetchQueryOptions<TInput, TError, TOutput>, TRPCRequestOptions {}
interface TRPCFetchInfiniteQueryOptions<TInput, TError, TOutput> extends FetchInfiniteQueryOptions<TInput, TError, TOutput>, TRPCRequestOptions {}
/** @internal */
type SSRState = 'mounted' | 'mounting' | 'prepass' | false;
interface ProxyTRPCContextProps<TRouter extends AnyRouter, TSSRContext> {
  /**
   * The `TRPCClient`
   */
  client: TRPCClient<TRouter>;
  /**
   * The SSR context when server-side rendering
   * @default null
   */
  ssrContext?: TSSRContext | null;
  /**
   * State of SSR hydration.
   * - `false` if not using SSR.
   * - `prepass` when doing a prepass to fetch queries' data
   * - `mounting` before TRPCProvider has been rendered on the client
   * - `mounted` when the TRPCProvider has been rendered on the client
   * @default false
   */
  ssrState?: SSRState;
  /**
   * @deprecated pass abortOnUnmount to `createTRPCReact` instead
   * Abort loading query calls when unmounting a component - usually when navigating to a new page
   * @default false
   */
  abortOnUnmount?: boolean;
}
/**
 * @internal
 */
type DecoratedProxyTRPCContextProps<TRouter extends AnyRouter, TSSRContext> = ProxyTRPCContextProps<TRouter, TSSRContext> & {
  client: CreateTRPCProxyClient<TRouter>;
};
interface TRPCContextProps<TRouter extends AnyRouter, TSSRContext> extends ProxyTRPCContextProps<TRouter, TSSRContext> {
  /**
   * The react-query `QueryClient`
   */
  queryClient: QueryClient;
}
//#endregion
//#region node_modules/@trpc/react-query/dist/internals/useQueries.d.ts
/**
 * @internal
 */
type UseQueryOptionsForUseQueries<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'context'>;
/**
 * @internal
 */
type TrpcQueryOptionsForUseQueries<TPath, TInput, TOutput, TData, TError> = Omit<UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError>, 'context'>;
/**
 * @internal
 */
declare type QueriesResults<TQueriesOptions extends UseQueryOptionsForUseQueries<any, any, any, any>[]> = { [TKey in keyof TQueriesOptions]: TQueriesOptions[TKey] extends UseQueryOptionsForUseQueries<infer TQueryFnData, infer TError, infer TData, any> ? UseTRPCQueryResult<unknown extends TData ? TQueryFnData : TData, TError> : never };
type GetOptions<TQueryOptions> = TQueryOptions extends UseQueryOptionsForUseQueries<any, any, any, any> ? TQueryOptions : never;
/**
 * @internal
 */
type QueriesOptions<TQueriesOptions extends any[], TResult extends any[] = []> = TQueriesOptions extends [] ? [] : TQueriesOptions extends [infer Head] ? [...TResult, GetOptions<Head>] : TQueriesOptions extends [infer Head, ...infer Tail] ? QueriesOptions<Tail, [...TResult, GetOptions<Head>]> : unknown[] extends TQueriesOptions ? TQueriesOptions : TQueriesOptions extends UseQueryOptionsForUseQueries<infer TQueryFnData, infer TError, infer TData, infer TQueryKey>[] ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData, TQueryKey>[] : UseQueryOptionsForUseQueries[];
/**
 * @internal
 */
type TRPCUseQueries<TRouter extends AnyRouter> = <TQueryOptions extends UseQueryOptionsForUseQueries<any, any, any, any>[]>(queriesCallback: (t: UseQueriesProcedureRecord<TRouter>) => readonly [...QueriesOptions<TQueryOptions>], context?: UseQueryOptions['context']) => QueriesResults<TQueryOptions>;
//#endregion
//#region node_modules/@trpc/react-query/dist/internals/useHookResult.d.ts
interface TRPCHookResult {
  trpc: {
    path: string;
  };
}
//#endregion
//#region node_modules/@trpc/react-query/dist/shared/hooks/types.d.ts
interface TRPCReactRequestOptions extends Omit<TRPCRequestOptions, 'signal'> {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
  /**
   * Opt out or into aborting request on unmount
   */
  abortOnUnmount?: boolean;
}
interface TRPCUseQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}
interface UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError, TQueryOptsData = TOutput> extends UseBaseQueryOptions<TOutput, TError, TData, TQueryOptsData, [TPath, TInput]>, TRPCUseQueryBaseOptions {}
interface TRPCProviderProps<TRouter extends AnyRouter, TSSRContext> extends TRPCContextProps<TRouter, TSSRContext> {
  children: ReactNode;
}
type TRPCProvider<TRouter extends AnyRouter, TSSRContext> = (props: TRPCProviderProps<TRouter, TSSRContext>) => JSX.Element;
type UseDehydratedState<TRouter extends AnyRouter> = (client: TRPCClient<TRouter>, trpcState: DehydratedState | undefined) => DehydratedState | undefined;
type CreateClient<TRouter extends AnyRouter> = (opts: CreateTRPCClientOptions<TRouter>) => TRPCClient<TRouter>;
/**
 * @internal
 */
type UseTRPCQueryResult<TData, TError> = TRPCHookResult & UseQueryResult<TData, TError>;
//#endregion
//#region node_modules/@trpc/react-query/dist/shared/proxy/utilsProxy.d.ts
type DecorateProcedure<TProcedure extends AnyQueryProcedure> = {
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
   */
  fetch(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TProcedure>, inferTransformedProcedureOutput<TProcedure>>): Promise<inferTransformedProcedureOutput<TProcedure>>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfinite(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchInfiniteQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TProcedure>, inferTransformedProcedureOutput<TProcedure>>): Promise<InfiniteData<inferTransformedProcedureOutput<TProcedure>>>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchquery
   */
  prefetch(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TProcedure>, inferTransformedProcedureOutput<TProcedure>>): Promise<void>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfinite(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchInfiniteQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TProcedure>, inferTransformedProcedureOutput<TProcedure>>): Promise<void>;
  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
   */
  ensureData(input: inferProcedureInput<TProcedure>, opts?: TRPCFetchQueryOptions<inferProcedureInput<TProcedure>, TRPCClientError<TProcedure>, inferTransformedProcedureOutput<TProcedure>>): Promise<inferTransformedProcedureOutput<TProcedure>>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientinvalidatequeries
   */
  invalidate(input?: DeepPartial<inferProcedureInput<TProcedure>>, filters?: Omit<InvalidateQueryFilters, 'predicate'> & {
    predicate?: (query: Query<inferProcedureInput<TProcedure>, TRPCClientError<TProcedure>, inferProcedureInput<TProcedure>, QueryKeyKnown<inferProcedureInput<TProcedure>, inferProcedureInput<TProcedure> extends {
      cursor?: any;
    } | void ? 'infinite' : 'query'>>) => boolean;
  }, options?: InvalidateOptions): Promise<void>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientrefetchqueries
   */
  refetch(input?: inferProcedureInput<TProcedure>, filters?: RefetchQueryFilters, options?: RefetchOptions): Promise<void>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientcancelqueries
   */
  cancel(input?: inferProcedureInput<TProcedure>, options?: CancelOptions): Promise<void>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientresetqueries
   */
  reset(input?: inferProcedureInput<TProcedure>, options?: ResetOptions): Promise<void>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
   */
  setData(
  /**
   * The input of the procedure
   */

  input: inferProcedureInput<TProcedure>, updater: Updater<inferTransformedProcedureOutput<TProcedure> | undefined, inferTransformedProcedureOutput<TProcedure> | undefined>, options?: SetDataOptions): void;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteData(input: inferProcedureInput<TProcedure>, updater: Updater<InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined, InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined>, options?: SetDataOptions): void;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
   */
  getData(input?: inferProcedureInput<TProcedure>): inferTransformedProcedureOutput<TProcedure> | undefined;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteData(input?: inferProcedureInput<TProcedure>): InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined;
};
/**
 * this is the type that is used to add in procedures that can be used on
 * an entire router
 */
type DecorateRouter = {
  /**
   * Invalidate the full router
   * @link https://trpc.io/docs/v10/useContext#query-invalidation
   * @link https://tanstack.com/query/v4/docs/react/guides/query-invalidation
   */
  invalidate(input?: undefined, filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void>;
};
/**
 * @internal
 */
type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> = DecorateRouter & { [TKey in keyof Filter<TRouter['_def']['record'], AnyQueryProcedure | AnyRouter>]: TRouter['_def']['record'][TKey] extends AnyRouter ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]> & DecorateRouter : DecorateProcedure<TRouter['_def']['record'][TKey]> };
type CreateReactUtilsProxy<TRouter extends AnyRouter, TSSRContext> = ProtectedIntersection<DecoratedProxyTRPCContextProps<TRouter, TSSRContext>, DecoratedProcedureUtilsRecord<TRouter>>;
//#endregion
//#region node_modules/@trpc/react-query/dist/shared/proxy/useQueriesProxy.d.ts
type GetQueryOptions<TProcedure extends AnyProcedure, TPath extends string> = <TData = inferTransformedProcedureOutput<TProcedure>>(input: inferProcedureInput<TProcedure>, opts?: TrpcQueryOptionsForUseQueries<TPath, inferProcedureInput<TProcedure>, inferTransformedProcedureOutput<TProcedure>, TData, TRPCClientError<TProcedure>>) => TrpcQueryOptionsForUseQueries<TPath, inferProcedureInput<TProcedure>, inferTransformedProcedureOutput<TProcedure>, TData, TRPCClientError<TProcedure>>;
/**
 * @internal
 */
type UseQueriesProcedureRecord<TRouter extends AnyRouter, TPath extends string = ''> = { [TKey in keyof Filter<TRouter['_def']['record'], AnyQueryProcedure | AnyRouter>]: TRouter['_def']['record'][TKey] extends AnyRouter ? UseQueriesProcedureRecord<TRouter['_def']['record'][TKey], `${TPath}${TKey & string}.`> : GetQueryOptions<TRouter['_def']['record'][TKey], `${TPath}${TKey & string}`> };
//#endregion
//#region node_modules/@trpc/react-query/dist/internals/getQueryKey.d.ts
type GetInfiniteQueryInput<TProcedureInput, TInputWithoutCursor = Omit<TProcedureInput, 'cursor'>> = keyof TInputWithoutCursor extends never ? undefined : DeepPartial<TInputWithoutCursor> | undefined;
/** @internal */
type GetQueryProcedureInput<TProcedureInput> = TProcedureInput extends {
  cursor?: any;
} ? GetInfiniteQueryInput<TProcedureInput> : DeepPartial<TProcedureInput> | undefined;
//#endregion
//#region node_modules/@trpc/react-query/dist/internals/getArrayQueryKey.d.ts
type QueryType = 'any' | 'infinite' | 'query';
type QueryKeyKnown<TInput, TType extends Exclude<QueryType, 'any'>> = [string[], {
  input?: GetQueryProcedureInput<TInput>;
  type: TType;
}?];
//#endregion
//#region node_modules/@trpc/react-query/dist/createTRPCReact.d.ts
/**
 * @internal
 */
type CreateTRPCReactBase<TRouter extends AnyRouter, TSSRContext> = {
  /**
   * @deprecated renamed to `useUtils` and will be removed in a future tRPC version
   *
   * @see https://trpc.io/docs/client/react/useUtils
   */
  useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
  /**
   * @see https://trpc.io/docs/client/react/useUtils
   */
  useUtils(): CreateReactUtilsProxy<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext>;
  createClient: CreateClient<TRouter>;
  useQueries: TRPCUseQueries<TRouter>;
  useDehydratedState: UseDehydratedState<TRouter>;
};
//#endregion
//#region src/frontend/create-trpc-clients.d.ts
declare function createTrpcClients<TAppApi extends AnyRouter>(options: {
  url: string;
}): {
  trpc: import("@trpc/server").ProtectedIntersection<CreateTRPCReactBase<TAppApi, unknown>, import("@trpc/react-query/shared").DecoratedProcedureRecord<TAppApi["_def"]["record"], null, "">>;
  trpcClient: TRPCClient<TAppApi>;
  trpcVanillaClient: import("@trpc/client").CreateTRPCProxyClient<TAppApi>;
};
//#endregion
//#region src/frontend/root-providers.d.ts
declare function createCoreProviders(trpc: {
  Provider: ComponentType<any>;
}, trpcClient: unknown, geigerEnabled?: boolean): {
  providers: WrapperItem[];
  queryClient: QueryClient;
};
//#endregion
//#region src/frontend/use-mutation-with-delta.d.ts
declare function useMutationWithDelta<TData, TError, TVariables, TContext>(mutation: UseTRPCMutationResult<{
  data: TData;
  delta: WorkspaceDelta;
}, TError, TVariables, TContext>, applyDelta: (delta: WorkspaceDelta) => void): Omit<UseTRPCMutationResult<TData, TError, TVariables, TContext>, "mutate" | "mutateAsync" | "data"> & {
  mutate: (variables: TVariables, options?: Parameters<UseTRPCMutationResult<TData, TError, TVariables, TContext>["mutate"]>[1]) => void;
  mutateAsync: (variables: TVariables, options?: Parameters<UseTRPCMutationResult<TData, TError, TVariables, TContext>["mutateAsync"]>[1]) => Promise<TData>;
  data: TData | undefined;
};
//#endregion
//#region src/frontend/ws-provider.d.ts
type WsContext = {
  target: EventTarget;
};
/**
 * The same `EventTarget` `useWs()` exposes, available at module scope so it can
 * be handed to `createWorkspaceProvider({ pokeTarget })` (which runs outside the
 * React tree). It emits the websocket's `message` events, plus an `open` event
 * on every (re)connect so consumers can catch up on changes missed while the
 * socket was down.
 */
declare const wsEventTarget: EventTarget;
declare const WsProvider: FC<{
  children: ReactNode;
  wsUrl: string;
}>;
declare const useWs: () => WsContext;
//#endregion
export { type WrapperItem, WsProvider, combineWrappers, createCoreProviders, createTrpcClients, useMutationWithDelta, useWs, workspaceVersionRef, wrp, wsEventTarget };
//# sourceMappingURL=frontend.d.cts.map