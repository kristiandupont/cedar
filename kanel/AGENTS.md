# cedar/kanel

**Purpose**: Shared Kanel configuration factory (`makeCedarKanelConfig`) used by both apps to generate typed DB models, Zod schemas, Knex table types, and seed files from a live Postgres schema.

**Notes**:

- Plain JavaScript (not TypeScript) — Kanel runs outside the compiled build pipeline, so this folder is intentionally not under `src/`.
- Apps call `makeCedarKanelConfig` in their own `.kanelrc.js`, passing app-specific `specificTypes` and `generateWorkspace` hooks; everything else (Zod config, custom type maps, seed generators) is provided here as the shared baseline.
- `defaultZodTypeMapExtensions` and `defaultCustomTypeMap` handle the `public.email` branded type (`EmailString` / `emailString` from `narrow-types`) and `pg_catalog.tsrange` mapped to `Range<Date>`.

**Key Files**:

- `make-kanel-config.js`: `makeCedarKanelConfig` — the sole export.
- `index.js`: Re-exports `makeCedarKanelConfig`.
