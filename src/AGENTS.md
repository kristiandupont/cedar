# cedar/src

**Purpose**: Source for all Cedar export namespaces. Each subfolder corresponds to one export path consumed by the apps.

**Subfolders**:

- `auth/` — `cedar/auth`: JWT session tokens, login token handlers.
- `backend/` — `cedar/backend`: Koa app factory, tRPC context, Knex DB, `trpcAssert`, workspace poke helper + topic socket registry + DB listener.
- `frontend/` — `cedar/frontend`: tRPC client factory, React core providers, WebSocket provider.
- `eslint/` — `cedar/eslint`: optional, opt-in lint rules. Currently `require-workspace-poke` (flags Knex writes to workspace tables that skip both the mutation wrapper and `pokeWorkspace`). Pure AST, no cedar runtime.
- `testing/` — `cedar/testing`: Vitest helpers for spinning up isolated test databases.

**Notes**:

- No shared files live at this level — each concept is fully self-contained within its namespace folder.
- `kanel/` (Kanel config helpers, `cedar/kanel`) lives outside `src/` due to tooling requirements (plain JS, not compiled).
