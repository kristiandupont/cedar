# cedar/src/backend

**Purpose**: Backend infrastructure — Koa app factory, tRPC context builder, Knex DB layer, and `trpcAssert`.

**Key Files**:

- `create-app.ts`: `createApp` — assembles the Koa app with CORS, Helmet, WebSocket support, tRPC middleware, and a `/ping` health route.
- `db.ts`: Knex DB via AsyncLocalStorage. `dbMiddleware` wraps every request in a transaction; `getDb` / `getTrx` retrieve the connection/transaction from the current async context without prop-drilling. `wrapInTransaction` is used by `cedar/testing`.
- `create-trpc.ts`: `buildContext` — extracts user (from Bearer JWT), client IP, origin, and `x-workspace-version` header into the tRPC context. `trpcConfig` sets SuperJSON as the transformer.
- `trpc-assert.ts`: `trpcAssert` — throws typed `TRPCError` instead of generic assertions.
- `poke-workspace.ts`: `pokeWorkspace(anchorType, anchorId)` — the app-level workspace poke (Phase 3). Emits a `workspace_changed` Postgres NOTIFY carrying only the typed anchor, on the current transaction (`getTrx`), so it rides commit and reaches every instance. Called from the two choke points: `protectedMutationWithDelta` (all client mutations) and directly from jobs/webhooks/cron.
- `socket-registry.ts`: `createSocketRegistry({ authenticate, resolveSubscriptions })` — the shared push registry. Sockets are keyed by **topic** (`member:{id}`, `anchor:{type}:{id}`), a socket may hold several, and its topics come from `resolveSubscriptions(member)` at connect. Exposes `wsHandler`, `sendToTopic`, `isTopicSubscribed`, `broadcast`. Uses `Map`/`Set` membership — it supersedes the old per-member registry whose `member.id in wsMap` check (property-`in` on a `Map`) silently orphaned reconnecting tabs.
- `db-listener.ts`: `establishDbListener(connectionString, channels) → { target, close }` — generalized Postgres `LISTEN/NOTIFY` → `EventTarget` bridge (was Beatpoints-only, `chat`-only). `bridgeWorkspacePokesToSockets({ target, sendToTopic })` consumes the `workspace_changed` channel, debounces ~100 ms per anchor key, and fans an anchor-named `workspace-poke` out to `anchor:{type}:{id}`.

**Notes**:

- Every request runs inside a Knex transaction (committed on success, rolled back on error). This means mutations don't need to manage transactions themselves.
- `dbAsyncLocalStorage` in `db.ts` is stored on `globalThis.__cedarDbStorage`. This ensures the CJS `backend.cjs` bundle and the ESM `testing.mjs` bundle share the same storage instance even though tsdown compiles them separately and each gets its own bundled copy of `db.ts`.
- **Poke transport, not source.** `pokeWorkspace` NOTIFYs; each instance's `establishDbListener` + `bridgeWorkspacePokesToSockets` LISTENs and pokes its own sockets. This is what makes a write on one instance reach a client connected to another. Single-instance collapses to the same path (it hears its own notify). Pokes are best-effort — a `pg-listen` reconnect drops notifications in its gap — so the client's fallback poll is the correctness backstop, not the poke.
- `pg-listen` (and its `pg` driver) are in `neverBundle`: native `pg` bindings must resolve from the consuming app, which already depends on both.
