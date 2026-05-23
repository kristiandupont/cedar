# cedar

Cedar is the shared framework library used by Beatpoints and Moneybutler. It extracts common Koa/tRPC/DB/auth scaffolding so both apps can share it without duplication.

## General Architecture

Cedar is a TypeScript library with multiple named export paths, consumed via `cedar/backend`, `cedar/frontend`, `cedar/auth`, `cedar/kanel`, and `cedar/testing`. Each path maps to a subfolder under `src/`.

**Export namespaces:**

- **`cedar/backend`** (`src/backend/`) — Koa app factory (`createApp`), tRPC server setup (`buildContext`, `trpcConfig`), Knex DB helpers (`initDb`, `getDb`, `getTrx`, etc.), `trpcAssert`.
- **`cedar/frontend`** (`src/frontend/`) — tRPC client factory (`createTrpcClients`), React core providers (`createCoreProviders`), `combineWrappers`, `useMutationWithDelta`, WebSocket provider.
- **`cedar/auth`** (`src/auth/`) — JWT session token handler, login token handler.
- **`cedar/kanel`** (`kanel/`) — Kanel configuration helpers for generating typed DB models.
- **`cedar/testing`** (`src/testing/`) — Test utilities: Knex helpers for spinning up test databases.

Code shared across namespaces lives at the root of `src/`. Namespace-specific code lives in its subfolder. Changes here affect both apps — only add things to Cedar when the pattern is genuinely shared; app-specific logic stays in the app.

### File and Folder Structure

**Applicability:**
These principles apply to all code. While React's multi-file nature makes it a clear example, the same logic applies to utilities, helpers, etc.

**Files:**
Refactor a file into a folder with well-named modules if it:

- Exceeds ~500 lines, **or**
- Handles multiple responsibilities (violates SRP).

**Folders:**

- Represent one feature/concept.
- **Co-locate** all related items (logic, styles, tests, utilities).
- If there is a single primary export, name the folder after the original file (e.g., `Button/` for `Button.tsx`).
- If there are multiple exports, use dash-case (e.g., `auth-helpers/`) and describe the category in the folder's `AGENTS.md`.

**Fractal Structure:**
Every folder, regardless of depth, follows the same rules.

**Co-location principles:**

- Co-locate by feature/concept, not by type (e.g., not "all hooks in one folder").
- When a file is reused across namespaces, move it to the root of `src/`.
- There are a few exceptions:
  - Namespaces (e.g., `backend/`, `frontend/`) are organised by consumer, not by feature.
  - `kanel/` lives outside `src/` due to tooling requirements.
- Consider the _Law of Demeter_ for imports: avoid deep relative paths. If needed, refactor to flatten the hierarchy.

### AGENTS.md Files

**Location:** Every `src/` folder and subfolder should include an `AGENTS.md`.

**Content:**

- **Purpose**: 1–2 sentences.
- **Notes**: Gotchas, unconventional patterns, known tech debt, or context not obvious from the code or naming.
- **Key Files**: Critical files/modules and their roles (skip obvious details).
- **Relationships**: Dependencies on other folders.

**Rules:**

- **Brevity**: Prioritize succinctness for LLM token efficiency. **Omit details derivable from conventions, naming, or folder structure.**
- **Prioritize the Notes section** for non-obvious context.
- **Usage**: Agents/developers **must** read this file before modifying the folder's contents.
- **Updates**: Required when adding/removing files, changing responsibilities, or creating subfolders (also update parent's `AGENTS.md`).

### Testing Philosophy

Prioritize _semantic coverage_ (testing behavior) over line coverage. **Focus on critical paths and refactoring safety.** Tests should enable safe refactoring; skip trivial paths (e.g., simple getters/setters) that add no value. The pattern is to create a file with the same name + `.test.ts(x)` next to the file being tested.
