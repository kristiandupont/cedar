import type { Rule } from "eslint";
import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";

import { requireWorkspacePoke } from "./index";

// The rule is typed structurally (see index.ts) to keep eslint's types out of
// the declaration bundle; hand RuleTester the real shape here.
const rule = requireWorkspacePoke as unknown as Rule.RuleModule;

// RuleTester calls bare describe/it; point them at vitest's. These static
// hooks exist at runtime but aren't in @types/eslint, hence the cast.
Object.assign(RuleTester, {
  afterAll,
  describe,
  it,
  itOnly: it.only,
});

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const options = [{ tables: ["account", "transaction"] }];

ruleTester.run("require-workspace-poke", rule, {
    valid: [
      // Not a workspace table.
      { code: `db("audit_log").insert(row);`, options },
      // Non-write on a workspace table.
      { code: `db("account").where({ id }).first();`, options },
      // Inside a tRPC mutation handler — the wrapper pokes.
      {
        code: `protectedProcedure.mutation(async () => { await db("account").update(x); });`,
        options,
      },
      // Same function also pokes.
      {
        code: `async function sync() { await db("transaction").insert(x); await pokeWorkspace("member", id); }`,
        options,
      },
      // Poke placed before the write, still same scope.
      {
        code: `async function sync() { await pokeWorkspace("member", id); await db("account").del(); }`,
        options,
      },
      // No tables configured → rule is inert.
      { code: `db("account").insert(x);`, options: [{ tables: [] }] },
      // Custom poke name honoured.
      {
        code: `function j() { db("account").update(x); notifyWorkspace("m", 1); }`,
        options: [{ tables: ["account"], pokeName: "notifyWorkspace" }],
      },
    ],
    invalid: [
      // A job writes a workspace table and forgets to poke.
      {
        code: `async function job() { await db("account").update({ x }); }`,
        options,
        errors: [{ messageId: "unpoked" }],
      },
      // Top-level write with no poke anywhere.
      {
        code: `db("transaction").insert(row);`,
        options,
        errors: [{ messageId: "unpoked" }],
      },
      // A poke in a *different* function does not cover this one.
      {
        code: `function other() { pokeWorkspace("member", 1); } function job() { db("account").del(); }`,
        options,
        errors: [{ messageId: "unpoked" }],
      },
    ],
});
