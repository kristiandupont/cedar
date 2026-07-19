import type { CallExpression, Node as EsNode } from "estree";

// Typed structurally against estree rather than importing from "eslint": the
// `eslint` types pull in `@eslint/plugin-kit`, whose broken `.d.cts` breaks
// tsdown's declaration bundling. This is only the slice of the ESLint rule API
// the rule uses, and it stays assignable to a real `Rule.RuleModule`.
interface RuleContext {
  options: unknown[];
  sourceCode: { getAncestors(node: EsNode): EsNode[] };
  report(descriptor: {
    node: EsNode;
    messageId: string;
    data?: Record<string, string>;
  }): void;
}
type Visitor = (node: never) => void;
interface RuleListener {
  [selector: string]: Visitor | undefined;
}
interface RuleModule {
  meta?: Record<string, unknown>;
  create(context: RuleContext): RuleListener;
}

/**
 * Optional, deliberately-pragmatic lint rule for the workspace-poke leak
 * surface (Phase 3). A raw write to a workspace table that goes through neither
 * `protectedMutationWithDelta` nor `pokeWorkspace` silently fails to notify
 * connected clients — the change only surfaces at the next fallback poll. This
 * rule flags the obvious shape of that mistake.
 *
 * It is Knex-specific (`db("table").insert/update/delete/del(...)`), so it is
 * shipped as an opt-in rule rather than forced on every cedar consumer, and it
 * is a **heuristic in the spirit of React's rules-of-hooks**: it catches the
 * common case and stays easy to override, rather than trying to be airtight and
 * getting in the way. It suppresses when:
 *
 *   - the write is inside a tRPC `.mutation(...)` handler (the wrapper pokes), or
 *   - the enclosing function also calls `pokeWorkspace(...)`.
 *
 * Anything it can't see through, a normal `eslint-disable-next-line` silences.
 * Configure it with the workspace table names:
 *
 *   rules: {
 *     "cedar/require-workspace-poke": ["warn", { tables: ["account", ...] }],
 *   }
 */

const WRITE_METHODS = new Set(["insert", "update", "delete", "del"]);
const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function calleeName(node: CallExpression): string | undefined {
  const { callee } = node;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return undefined;
}

/** The workspace table a Knex write targets, if this is one: the string literal
 * passed to the query-builder call the write method hangs off. */
function writtenTable(node: CallExpression, tables: Set<string>): string | undefined {
  if (node.callee.type !== "MemberExpression") return undefined;
  if (node.callee.property.type !== "Identifier") return undefined;
  if (!WRITE_METHODS.has(node.callee.property.name)) return undefined;

  const receiver = node.callee.object;
  if (receiver.type !== "CallExpression") return undefined;
  const tableArg = receiver.arguments[0];
  if (!tableArg || tableArg.type !== "Literal") return undefined;
  if (typeof tableArg.value !== "string") return undefined;

  return tables.has(tableArg.value) ? tableArg.value : undefined;
}

/** Nearest enclosing function node, or the Program when the write is top-level;
 * used as the identity a `pokeWorkspace` call is attributed to. */
function enclosingScope(ancestors: EsNode[]): EsNode | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (FUNCTION_TYPES.has(ancestors[i].type)) return ancestors[i];
  }
  return ancestors[0]; // Program
}

function insideMutationHandler(ancestors: EsNode[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "CallExpression" &&
      a.callee.type === "MemberExpression" &&
      a.callee.property.type === "Identifier" &&
      a.callee.property.name === "mutation",
  );
}

const requireWorkspacePoke: RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Flag raw writes to workspace tables that neither run through a tRPC mutation nor poke the workspace, so clients aren't left un-notified.",
    },
    schema: [
      {
        type: "object",
        properties: {
          tables: { type: "array", items: { type: "string" }, uniqueItems: true },
          pokeName: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unpoked:
        "Write to workspace table '{{table}}' won't notify clients: route it through protectedMutationWithDelta, or call {{pokeName}}(...) in this function (then disable this line if the poke is indirect).",
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as {
      tables?: string[];
      pokeName?: string;
    };
    const tables = new Set(options.tables ?? []);
    const pokeName = options.pokeName ?? "pokeWorkspace";
    if (tables.size === 0) return {};

    const sourceCode = context.sourceCode;
    // Scopes (functions / Program) that call the poke helper.
    const pokedScopes = new Set<EsNode>();
    // Deferred so a poke placed after the write in the same function still counts.
    const pending: { node: CallExpression; table: string; scope: EsNode }[] = [];

    return {
      CallExpression(node: CallExpression) {
        const ancestors = sourceCode.getAncestors(node);

        if (calleeName(node) === pokeName) {
          const scope = enclosingScope([...ancestors, node]);
          if (scope) pokedScopes.add(scope);
          return;
        }

        const table = writtenTable(node, tables);
        if (!table) return;
        if (insideMutationHandler(ancestors)) return;

        const scope = enclosingScope(ancestors);
        if (scope) pending.push({ node, table, scope });
      },

      "Program:exit"() {
        for (const { node, table, scope } of pending) {
          if (pokedScopes.has(scope)) continue;
          context.report({
            node,
            messageId: "unpoked",
            data: { table, pokeName },
          });
        }
      },
    };
  },
};

export const rules = { "require-workspace-poke": requireWorkspacePoke };

const plugin = {
  meta: { name: "cedar", version: "0.1.0" },
  rules,
};

export { requireWorkspacePoke };
export default plugin;
