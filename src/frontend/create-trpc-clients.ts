import { createTRPCProxyClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AnyRouter } from "@trpc/server";
import superjson from "superjson";

import { workspaceVersionRef } from "workspace-sync";

export { workspaceVersionRef };

async function buildHeaders(): Promise<Record<string, string>> {
  const sessionToken = localStorage.getItem("sessionToken");
  const headers: Record<string, string> = {
    authorization: sessionToken ? `Bearer ${sessionToken}` : "",
  };

  if (workspaceVersionRef.current) {
    headers["x-workspace-version"] =
      workspaceVersionRef.current.toISOString();
  }

  return headers;
}

export function createTrpcClients<TAppApi extends AnyRouter>(options: {
  url: string;
}) {
  const trpc = createTRPCReact<TAppApi>();

  // Cast needed: createTRPCReact returns a ProtectedIntersection that includes
  // string-literal error types when TAppApi is generic, hiding createClient.
  const trpcClient = (trpc as any).createClient({  // eslint-disable-line @typescript-eslint/no-explicit-any
    transformer: superjson,
    links: [httpBatchLink({ url: options.url, headers: buildHeaders })],
  }) as TRPCClient<TAppApi>;

  // Cast needed: CreateTRPCClientBaseOptions<TAppApi> is a conditional type that
  // can't be satisfied with a concrete transformer when TAppApi is generic.
  const trpcVanillaClient = createTRPCProxyClient<TAppApi>({
    transformer: superjson,
    links: [httpBatchLink({ url: options.url, headers: buildHeaders })],
  } as any);  // eslint-disable-line @typescript-eslint/no-explicit-any

  return { trpc, trpcClient, trpcVanillaClient };
}
