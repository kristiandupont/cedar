# cedar/src/backend

**Purpose**: Backend infrastructure — HTTP server factory, tRPC context builder, Knex DB layer, and `trpcAssert`.

**Key Files**:

- `create-app.ts`: `createApp` — returns a `node:http` `Server` with `/ping`, tRPC under `/trpc` (via `nodeHTTPRequestHandler`), and, when `wsHandler` is given, WebSocket upgrades on `/ws` (via `ws`). Sets the security headers koa-helmet used to set and permissive CORS (any origin, no credentials). Every request except a CORS preflight runs in `wrapInTransaction`. There is no Koa: the apps only call `createApp(...).listen(port)`.
- `create-app.test.ts`: starts the real server on a random port and checks routes, headers, CORS, per-request transactions and socket auth, with a fake Knex. The inline snapshots were recorded from the previous Koa implementation.
- `db.ts`: Knex DB via AsyncLocalStorage. `createApp` wraps every request in a transaction with `wrapInTransaction`; `getDb` / `getTrx` retrieve the connection/transaction from the current async context without prop-drilling. `wrapInTransaction` is also used by `cedar/testing` and by the apps (e.g. socket auth).
- `create-trpc.ts`: `buildContext` — extracts user (from Bearer JWT), client IP, origin, and `x-workspace-version` header into the tRPC context. `trpcConfig` sets SuperJSON as the transformer.
- `trpc-assert.ts`: `trpcAssert` — throws typed `TRPCError` instead of generic assertions.
- `poke-workspace.ts`: `pokeWorkspace(anchorType, anchorId)` — the app-level workspace poke (Phase 3). Emits a `workspace_changed` Postgres NOTIFY carrying only the typed anchor, on the current transaction (`getTrx`), so it rides commit and reaches every instance. Called from the two choke points: `protectedMutationWithDelta` (all client mutations) and directly from jobs/webhooks/cron.
- `socket-registry.ts`: `createSocketRegistry({ authenticate, resolveSubscriptions })` — the shared push registry. Sockets are keyed by **topic** (`member:{id}`, `anchor:{type}:{id}`), a socket may hold several, and its topics come from `resolveSubscriptions(member)` at connect. Exposes `wsHandler` (`(socket, req) => Promise<void>`, passed to `createApp`), `sendToTopic`, `isTopicSubscribed`, `broadcast`. Uses `Map`/`Set` membership — it supersedes the old per-member registry whose `member.id in wsMap` check (property-`in` on a `Map`) silently orphaned reconnecting tabs.
- `db-listener.ts`: `establishDbListener(connectionString, channels) → { target, close }` — generalized Postgres `LISTEN/NOTIFY` → `EventTarget` bridge (was Beatpoints-only, `chat`-only). `bridgeWorkspacePokesToSockets({ target, sendToTopic })` consumes the `workspace_changed` channel, debounces ~100 ms per anchor key, and fans an anchor-named `workspace-poke` out to `anchor:{type}:{id}`.

**Notes**:

- Every request runs inside a Knex transaction, so mutations don't manage transactions themselves. **It is rolled back only when the request handler itself throws.** tRPC catches errors thrown by a procedure and writes an error response, so the transaction still **commits**: writes a failing mutation made before it threw are kept. `create-app.test.ts` records this. It was the same under Koa.
- `dbAsyncLocalStorage` in `db.ts` is stored on `globalThis.__cedarDbStorage`. This ensures the CJS `backend.cjs` bundle and the ESM `testing.mjs` bundle share the same storage instance even though tsdown compiles them separately and each gets its own bundled copy of `db.ts`.
- **Poke transport, not source.** `pokeWorkspace` NOTIFYs; each instance's `establishDbListener` + `bridgeWorkspacePokesToSockets` LISTENs and pokes its own sockets. This is what makes a write on one instance reach a client connected to another. Single-instance collapses to the same path (it hears its own notify). Pokes are best-effort — a `pg-listen` reconnect drops notifications in its gap — so the client's fallback poll is the correctness backstop, not the poke.
- `pg-listen` (and its `pg` driver) are in `neverBundle`: native `pg` bindings must resolve from the consuming app, which already depends on both.
