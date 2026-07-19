import { performance } from "node:perf_hooks";
import { afterAll, beforeAll } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import knex from "knex";
import "pg";
import "postgres-range";
import "superjson";
//#region src/backend/db.ts
globalThis.__cedarDbStorage ??= new AsyncLocalStorage();
const dbAsyncLocalStorage = globalThis.__cedarDbStorage;
let _globalDb = null;
function wrapInTransaction(callback, db) {
	return async (...args) => {
		const target = db ?? _globalDb;
		if (!target) throw new Error("initDb() must be called before wrapping transactions");
		return target.transaction(async (trx) => dbAsyncLocalStorage.run({
			db: target,
			trx
		}, async () => await callback(...args)));
	};
}
//#endregion
//#region src/testing/get-knex-for.ts
function getConnectionStringForDatabase(connectionString, database) {
	const url = new URL(connectionString);
	url.pathname = `/${database}`;
	return url.toString();
}
function getKnexFor(knexConfig, database) {
	return knex({
		...knexConfig,
		connection: getConnectionStringForDatabase(knexConfig.connection, database)
	});
}
//#endregion
//#region src/testing/index.ts
function getFullSuiteName(suite) {
	if (suite.suite) {
		const parentName = getFullSuiteName(suite.suite);
		return parentName === "" ? suite.name : parentName + " " + suite.name;
	}
	return suite.name;
}
function useTestDatabase(config) {
	let templateConnection;
	let db;
	let dbName;
	beforeAll(async (suite) => {
		const perfStart = performance.now();
		templateConnection = getKnexFor(config.knexConfig, config.templateDbName);
		dbName = "test_" + getFullSuiteName(suite).replaceAll(/\W+/g, "_");
		await templateConnection.raw("DROP DATABASE IF EXISTS ??", [dbName]);
		await templateConnection.raw("CREATE DATABASE ?? WITH TEMPLATE ??", [dbName, config.templateDbName]);
		db = getKnexFor(config.knexConfig, dbName);
		const duration = performance.now() - perfStart;
		if (duration > 2e3) console.warn(`Test-specific db cloned. Time: ${(duration / 1e3).toFixed(2)} seconds`);
	});
	afterAll(async () => {
		await db.destroy();
		if (config.preserveAfterTest) console.info("Database preserved on disk: " + dbName);
		else await templateConnection.raw("DROP DATABASE ??", [dbName]);
		await templateConnection.destroy();
	});
	return {
		getDb: () => db,
		inTrx: (cb) => wrapInTransaction(cb, db)()
	};
}
//#endregion
export { getKnexFor, useTestDatabase };

//# sourceMappingURL=testing.mjs.map