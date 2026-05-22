import { performance } from "node:perf_hooks";

import type { Knex } from "knex";
import type { Suite } from "vitest";
import { afterAll, beforeAll } from "vitest";

import { wrapInTransaction } from "../backend/db";
import { getKnexFor } from "./get-knex-for";

export { getKnexFor };

function getFullSuiteName(suite: Suite): string {
  if (suite.suite) {
    const parentName = getFullSuiteName(suite.suite);
    return parentName === "" ? suite.name : parentName + " " + suite.name;
  }
  return suite.name;
}

export function useTestDatabase(config: {
  templateDbName: string;
  knexConfig: Knex.Config;
  preserveAfterTest?: boolean;
}): {
  getDb: () => Knex;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inTrx: <R>(cb: (...args: any) => Promise<R>) => Promise<R>;
} {
  let templateConnection: Knex;
  let db: Knex;
  let dbName: string;

  beforeAll(async (meta) => {
    const perfStart = performance.now();

    templateConnection = getKnexFor(config.knexConfig, config.templateDbName);

    const fullSuiteName = getFullSuiteName(meta);
    dbName = "test_" + fullSuiteName.replaceAll(/\W+/g, "_");

    await templateConnection.raw("DROP DATABASE IF EXISTS ??", [dbName]);
    await templateConnection.raw("CREATE DATABASE ?? WITH TEMPLATE ??", [
      dbName,
      config.templateDbName,
    ]);

    db = getKnexFor(config.knexConfig, dbName);

    const perfEnd = performance.now();
    const duration = perfEnd - perfStart;
    if (duration > 2000) {
      console.warn(
        `Test-specific db cloned. Time: ${(duration / 1000).toFixed(2)} seconds`,
      );
    }
  });

  afterAll(async () => {
    await db.destroy();
    if (config.preserveAfterTest) {
      console.info("Database preserved on disk: " + dbName);
    } else {
      await templateConnection.raw("DROP DATABASE ??", [dbName]);
    }
    await templateConnection.destroy();
  });

  return {
    getDb: () => db,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inTrx: <R>(cb: (...args: any) => Promise<R>): Promise<R> =>
      wrapInTransaction(cb, db)(),
  };
}
