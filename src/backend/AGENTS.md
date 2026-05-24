# cedar/src/backend

**Purpose**: Backend infrastructure — Koa app factory, tRPC context builder, Knex DB layer, and `trpcAssert`.

**Key Files**:

- `create-app.ts`: `createApp` — assembles the Koa app with CORS, Helmet, WebSocket support, tRPC middleware, and a `/ping` health route.
- `db.ts`: Knex DB via AsyncLocalStorage. `dbMiddleware` wraps every request in a transaction; `getDb` / `getTrx` retrieve the connection/transaction from the current async context without prop-drilling. `wrapInTransaction` is used by `cedar/testing`.
- `create-trpc.ts`: `buildContext` — extracts user (from Bearer JWT), client IP, origin, and `x-workspace-version` header into the tRPC context. `trpcConfig` sets SuperJSON as the transformer.
- `trpc-assert.ts`: `trpcAssert` — throws typed `TRPCError` instead of generic assertions.

**Notes**:

- Every request runs inside a Knex transaction (committed on success, rolled back on error). This means mutations don't need to manage transactions themselves.
- `dbAsyncLocalStorage` in `db.ts` is stored on `globalThis.__cedarDbStorage`. This ensures the CJS `backend.cjs` bundle and the ESM `testing.mjs` bundle share the same storage instance even though tsdown compiles them separately and each gets its own bundled copy of `db.ts`.
