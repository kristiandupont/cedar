# cedar/src/testing

**Purpose**: Vitest helpers for integration tests that need a real Postgres database.

**Key Files**:

- `index.ts`: `useTestDatabase` — Vitest `beforeAll`/`afterAll` hooks that clone a template DB into a uniquely named test DB, run the suite against it, then drop it. Returns `getDb()` and `inTrx()` for use in tests.
- `get-knex-for.ts`: `getKnexFor` — creates a Knex instance pointed at a specific named database (used internally by `useTestDatabase`).

**Notes**:

- Intentionally imports `wrapInTransaction` from `../backend/db` — `inTrx` needs the same AsyncLocalStorage wiring that the real app uses, so tests exercise the actual transaction plumbing.
- This entry compiles to **ESM** (`testing.mjs`) because vitest 3+ throws if `require()`d from CJS. Consuming apps must add `server: { deps: { inline: ["cedar"] } }` to their vitest config so the module shares the test runner context.
- `wrapInTransaction` is bundled into `testing.mjs` separately from `backend.cjs`, giving them different `AsyncLocalStorage` instances. The storage is anchored on `globalThis.__cedarDbStorage` (in `backend/db.ts`) so both copies always share the same instance.
- Template DB cloning can be slow; a warning is logged if it takes over 2 s.
