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

// The return type must be spelled out. `trpc`'s inferred type lives at
// `@trpc/react-query/dist/createTRPCReact`, which the package's export map does
// not expose, so declaration emit cannot name it and fails with TS2742. Naming
// it via `ReturnType<typeof ...>` uses only the public exports, which stays
// portable — and does not depend on `baseUrl`, which TypeScript 7 removes.
export function createTrpcClients<TAppApi extends AnyRouter>(options: {
  url: string;
}): {
  trpc: ReturnType<typeof createTRPCReact<TAppApi>>;
  trpcClient: TRPCClient<TAppApi>;
  trpcVanillaClient: ReturnType<typeof createTRPCProxyClient<TAppApi>>;
} {
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
