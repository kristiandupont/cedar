import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { requireWorkspacePoke } from "./index";

// The rule is typed structurally (see index.ts) to keep the linter's types out
// of the declaration bundle; hand RuleTester the real shape here. `Rule` is not
// exported from oxlint/plugins-dev, so borrow it from the `run` signature.
const rule = requireWorkspacePoke as unknown as Parameters<
  RuleTester["run"]
>[1];

// RuleTester calls bare describe/it; point them at vitest's.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// oxc always parses the latest ECMAScript, so there is no `ecmaVersion` to set.
const ruleTester = new RuleTester({
  languageOptions: { sourceType: "module" },
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
