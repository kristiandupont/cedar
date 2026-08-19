import { AnyRouter } from "@trpc/server";
import { ComponentProps, ComponentType, FC, ReactNode } from "react";
import { TRPCClient, createTRPCProxyClient } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { WorkspaceDelta, workspaceVersionRef } from "workspace-sync";
import { QueryClient } from "@tanstack/react-query";
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
//#region src/frontend/create-trpc-clients.d.ts
declare function createTrpcClients<TAppApi extends AnyRouter>(options: {
  url: string;
}): {
  trpc: ReturnType<typeof createTRPCReact<TAppApi>>;
  trpcClient: TRPCClient<TAppApi>;
  trpcVanillaClient: ReturnType<typeof createTRPCProxyClient<TAppApi>>;
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