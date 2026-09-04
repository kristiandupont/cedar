Object.defineProperties(exports, {
	__esModule: { value: true },
	[Symbol.toStringTag]: { value: "Module" }
});
//#region src/eslint/index.ts
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
const WRITE_METHODS = /* @__PURE__ */ new Set([
	"insert",
	"update",
	"delete",
	"del"
]);
const FUNCTION_TYPES = /* @__PURE__ */ new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression"
]);
function calleeName(node) {
	const { callee } = node;
	if (callee.type === "Identifier") return callee.name;
	if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;
}
/** The workspace table a Knex write targets, if this is one: the string literal
* passed to the query-builder call the write method hangs off. */
function writtenTable(node, tables) {
	if (node.callee.type !== "MemberExpression") return void 0;
	if (node.callee.property.type !== "Identifier") return void 0;
	if (!WRITE_METHODS.has(node.callee.property.name)) return void 0;
	const receiver = node.callee.object;
	if (receiver.type !== "CallExpression") return void 0;
	const tableArg = receiver.arguments[0];
	if (!tableArg || tableArg.type !== "Literal") return void 0;
	if (typeof tableArg.value !== "string") return void 0;
	return tables.has(tableArg.value) ? tableArg.value : void 0;
}
/** Nearest enclosing function node, or the Program when the write is top-level;
* used as the identity a `pokeWorkspace` call is attributed to. */
function enclosingScope(ancestors) {
	for (let i = ancestors.length - 1; i >= 0; i--) if (FUNCTION_TYPES.has(ancestors[i].type)) return ancestors[i];
	return ancestors[0];
}
function insideMutationHandler(ancestors) {
	return ancestors.some((a) => a.type === "CallExpression" && a.callee.type === "MemberExpression" && a.callee.property.type === "Identifier" && a.callee.property.name === "mutation");
}
const requireWorkspacePoke = {
	meta: {
		type: "problem",
		docs: { description: "Flag raw writes to workspace tables that neither run through a tRPC mutation nor poke the workspace, so clients aren't left un-notified." },
		schema: [{
			type: "object",
			properties: {
				tables: {
					type: "array",
					items: { type: "string" },
					uniqueItems: true
				},
				pokeName: { type: "string" }
			},
			additionalProperties: false
		}],
		messages: { unpoked: "Write to workspace table '{{table}}' won't notify clients: route it through protectedMutationWithDelta, or call {{pokeName}}(...) in this function (then disable this line if the poke is indirect)." }
	},
	create(context) {
		const options = context.options[0] ?? {};
		const tables = new Set(options.tables ?? []);
		const pokeName = options.pokeName ?? "pokeWorkspace";
		if (tables.size === 0) return {};
		const sourceCode = context.sourceCode;
		const pokedScopes = /* @__PURE__ */ new Set();
		const pending = [];
		return {
			CallExpression(node) {
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
				if (scope) pending.push({
					node,
					table,
					scope
				});
			},
			"Program:exit"() {
				for (const { node, table, scope } of pending) {
					if (pokedScopes.has(scope)) continue;
					context.report({
						node,
						messageId: "unpoked",
						data: {
							table,
							pokeName
						}
					});
				}
			}
		};
	}
};
const rules = { "require-workspace-poke": requireWorkspacePoke };
const plugin = {
	meta: {
		name: "cedar",
		version: "0.1.0"
	},
	rules
};
//#endregion
exports.default = plugin;
exports.requireWorkspacePoke = requireWorkspacePoke;
exports.rules = rules;

//# sourceMappingURL=eslint.cjs.map