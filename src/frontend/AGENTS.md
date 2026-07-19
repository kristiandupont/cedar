# cedar/src/frontend

**Purpose**: Frontend infrastructure — tRPC client setup, React core providers, WebSocket client, and composition utilities.

**Key Files**:

- `create-trpc-clients.ts`: `createTrpcClients` — creates the tRPC React hook client, a vanilla proxy client, and wires the `x-workspace-version` header into every request via `workspaceVersionRef` from `workspace-sync`.
- `root-providers.tsx`: `createCoreProviders` — returns the tRPC + React Query provider stack and a `queryClient`. Apps extend it with app-specific providers via `combineWrappers`.
- `combine-wrappers.tsx`: `combineWrappers` / `wrp` — composes an array of React providers into a single wrapper component, avoiding deeply nested JSX.
- `ws-provider.tsx`: `WsProvider` — maintains a WebSocket connection (reconnects every 1 s if closed); `useWs` exposes the shared `EventTarget` for dispatching/listening to push events. The same target is also exported as `wsEventTarget` for use at module scope (e.g. `createWorkspaceProvider({ pokeTarget })`, which runs outside React). It emits the socket's `message` events plus an `open` event on every (re)connect, so workspace providers can pull a catch-up delta after a drop.
- `use-mutation-with-delta.ts`: tRPC mutation wrapper that applies workspace deltas from mutation responses.

**Notes**:

- React Query is configured with all refetch behaviours disabled by default (`refetchOnMount`, `refetchOnWindowFocus`, etc.) — workspace-sync polling is the update mechanism, not React Query's own refetching.

**Relationships**: `create-trpc-clients.ts` imports `workspaceVersionRef` from `workspace-sync`.
