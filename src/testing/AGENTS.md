# cedar/src/testing

**Purpose**: Vitest helpers for integration tests that need a real Postgres database.

**Key Files**:

- `index.ts`: `useTestDatabase` — Vitest `beforeAll`/`afterAll` hooks that clone a template DB into a uniquely named test DB, run the suite against it, then drop it. Returns `getDb()` and `inTrx()` for use in tests.
- `get-knex-for.ts`: `getKnexFor` — creates a Knex instance pointed at a specific named database (used internally by `useTestDatabase`).

**Notes**:

- Intentionally imports `wrapInTransaction` from `../backend/db` — `inTrx` needs the same AsyncLocalStorage wiring that the real app uses, so tests exercise the actual transaction plumbing.
- Template DB cloning can be slow; a warning is logged if it takes over 2 s.
