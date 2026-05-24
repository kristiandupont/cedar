# cedar

Cedar is the shared framework library for Beatpoints and Moneybutler. It extracts common Koa/tRPC/DB/auth/kanel scaffolding so both apps share it without duplication.

## Export paths

| Import | Entry file | What it provides |
|--------|-----------|-----------------|
| `cedar/backend` | `src/backend/` | Koa app factory (`createApp`), tRPC context (`buildContext`, `trpcConfig`), Knex DB layer (`initDb`, `getTrx`, `dbMiddleware`, `wrapInTransaction`), `trpcAssert` |
| `cedar/frontend` | `src/frontend/` | tRPC client factory (`createTrpcClients`), React core providers (`createCoreProviders`), `combineWrappers`, WebSocket provider |
| `cedar/auth` | `src/auth/` | JWT session token handler (`createSessionTokenHandler`), login token handler (`createLoginTokenHandler`) |
| `cedar/testing` | `src/testing/` | Vitest helpers: `useTestDatabase` (clones template DB per test suite), `getKnexFor` |
| `cedar/kanel` | `kanel/` | Kanel config helpers for generating typed DB models (plain JS, not compiled) |

## Build

Cedar compiles to `dist/` via tsdown (Rolldown-based). All entries except `testing` are CJS (`.cjs` / `.d.cts`). The `testing` entry is ESM (`.mjs` / `.d.mts`) because vitest 3+ cannot be `require()`d from CJS.

**After a fresh checkout:**

```sh
cd cedar
npm install
npm run build       # populates dist/
npm run build:watch # incremental rebuilds during development
```

The compiled `dist/` is committed to the repo so that `npm install` from GitHub works in CI without a build step.

## Scripts

| Script | What it does |
|--------|-------------|
| `npm run build` | Compile all entries to `dist/` via tsdown |
| `npm run build:watch` | Incremental rebuild on file change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over `src/` |
| `npm run test` | `vitest run` |

## Usage in consuming apps

Apps reference Cedar as `"cedar": "github:kristiandupont/cedar#main"`. Locally, each app's `postinstall` creates a proxy directory at `node_modules/cedar/` containing only `package.json`, `dist/`, and `kanel/` as symlinks — no `node_modules/` inside, so TypeScript's upward resolution never reaches Cedar's own dependencies.

Apps must keep these in their `tsconfig.json` `paths`:

```json
"knex": ["./node_modules/knex"],
"koa":  ["./node_modules/koa"],
"react": ["./node_modules/react"],
"@trpc/server": ["./node_modules/@trpc/server"],
...
```

And in their `vite.config.ts` test config:

```ts
server: { deps: { inline: ["cedar"] } }
```

This is required so that `cedar/testing`'s `beforeAll`/`afterAll` calls share the vitest runner context with the test files.

## Peer dependencies

Apps must provide: `@tanstack/react-query >=4`, `knex >=3`, `koa >=2`, `narrow-types >=1`, `react >=18`.

Cedar does **not** declare `@trpc/*` as peer deps (they're internal to Cedar's build), but apps must have them in their own `dependencies` because tRPC requires a single instance.
