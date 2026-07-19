Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_chunk = require("../chunk-CKQMccvm.cjs");
let knex = require("knex");
knex = require_chunk.__toESM(knex);
//#region src/testing/get-knex-for.ts
function getConnectionStringForDatabase(connectionString, database) {
	const url = new URL(connectionString);
	url.pathname = `/${database}`;
	return url.toString();
}
function getKnexFor(knexConfig, database) {
	return (0, knex.default)({
		...knexConfig,
		connection: getConnectionStringForDatabase(knexConfig.connection, database)
	});
}
//#endregion
exports.getKnexFor = getKnexFor;

//# sourceMappingURL=db.cjs.map