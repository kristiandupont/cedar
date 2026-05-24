import { defineConfig } from "tsdown";

const neverBundle = [
  // Peer deps — must be single instance in the consuming app
  "@tanstack/react-query",
  "knex",
  "koa",
  "narrow-types",
  "react",
  // tRPC — singleton; apps own these directly
  "@trpc/client",
  "@trpc/react-query",
  "@trpc/server",
  // workspace-sync — shared instance with the app
  "workspace-sync",
  // vitest — test context must be the app's own instance
  "vitest",
  /^@vitest\/.*/,
] as const;

export default defineConfig([
  {
    // CJS output for all runtime entries
    entry: {
      backend: "src/backend/index.ts",
      frontend: "src/frontend/index.ts",
      auth: "src/auth/index.ts",
      "testing/db": "src/testing/get-knex-for.ts",
    },
    format: ["cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    deps: { neverBundle },
  },
  {
    // ESM output for the testing entry: vitest is ESM-only and cannot be
    // required() from CJS. server.deps.inline in the consuming app's vite
    // config ensures the ESM module shares vitest's runner context.
    entry: {
      testing: "src/testing/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    deps: { neverBundle },
  },
]);
