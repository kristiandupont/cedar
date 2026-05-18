import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { Geiger } from "react-geiger";

import { wrp, type WrapperItem } from "./combine-wrappers";

const defaultQueryClientOptions = {
  queries: {
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  },
};

export function createCoreProviders(
  trpc: { Provider: ComponentType<any> },
  trpcClient: unknown,
  geigerEnabled = false,
): { providers: WrapperItem[]; queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: defaultQueryClientOptions,
  });

  const providers: WrapperItem[] = [
    wrp(trpc.Provider, { client: trpcClient, queryClient }),
    wrp(QueryClientProvider, { client: queryClient }),
    wrp(Geiger, { enabled: geigerEnabled }),
  ];

  return { providers, queryClient };
}
