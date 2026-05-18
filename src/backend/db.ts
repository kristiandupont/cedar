import { AsyncLocalStorage } from "node:async_hooks";

import type { Knex } from "knex";
import knex from "knex";
import type * as Koa from "koa";

type DbStore = {
  db: Knex;
  trx?: Knex.Transaction;
};

const dbAsyncLocalStorage = new AsyncLocalStorage<DbStore>();

let _globalDb: Knex | null = null;

export function initDb(config: Knex.Config): void {
  _globalDb = knex(config);
}

const getDb = (): Knex => {
  const { db } = dbAsyncLocalStorage.getStore() || {};

  if (!db) {
    throw new Error("Knex instance not found in AsyncLocalStorage");
  }

  return db;
};

export const getTrx = (): Knex.Transaction => {
  const { trx } = dbAsyncLocalStorage.getStore() || {};

  if (!trx) {
    throw new Error("Transaction not found in AsyncLocalStorage");
  }

  return trx;
};

export const dbMiddleware: Koa.Middleware = async (_ctx, next) => {
  if (!_globalDb) {
    throw new Error("initDb() must be called before handling requests");
  }
  return _globalDb.transaction(async (trx) =>
    dbAsyncLocalStorage.run({ db: _globalDb!, trx }, async () => {
      await next();
    }),
  );
};

export function wrapInTransaction<A extends Array<unknown>, R>(
  callback: (...args: A) => Promise<R>,
  db?: Knex,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const target = db ?? _globalDb;
    if (!target) throw new Error("initDb() must be called before wrapping transactions");
    return target.transaction(async (trx) =>
      dbAsyncLocalStorage.run({ db: target, trx }, async () => await callback(...args)),
    );
  };
}

export default getDb;
