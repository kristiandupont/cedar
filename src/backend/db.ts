import { AsyncLocalStorage } from "node:async_hooks";

import type { Knex } from "knex";
import knex from "knex";
import type * as Koa from "koa";
import { types } from "pg";
import { parse, Range, serialize } from "postgres-range";
import SuperJSON from "superjson";

type DbStore = {
  db: Knex;
  trx?: Knex.Transaction;
};

const dbAsyncLocalStorage = new AsyncLocalStorage<DbStore>();

let _globalDb: Knex | null = null;

function setupRangeTypes(): void {
  const TSRANGE_OID = 3908;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  types.setTypeParser(TSRANGE_OID as any, (v) => parse(v, (v) => new Date(v)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Range.prototype as any).toPostgres = function (
    prepareValue: (v: Date) => string,
  ): string {
    return serialize(this as Range<Date>, prepareValue);
  };

  SuperJSON.registerCustom<Range<Date>, string>(
    {
      isApplicable: (v): v is Range<Date> => v instanceof Range,
      serialize: (v) => serialize(v, (v) => v.toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deserialize: (v) => parse(v as any, (v) => new Date(v)),
    },
    "Range<Date>",
  );
}

export function initDb(config: Knex.Config): void {
  _globalDb = knex(config);
  setupRangeTypes();
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
