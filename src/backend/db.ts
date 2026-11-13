import { AsyncLocalStorage } from "node:async_hooks";

import type { Knex } from "knex";
import knex from "knex";
import { types } from "pg";
import { parse, Range, serialize } from "postgres-range";
import SuperJSON from "superjson";

type DbStore = {
  db: Knex;
  trx?: Knex.Transaction;
};

// Use a global so that multiple bundle copies of this module (e.g. testing.mjs
// and backend.cjs in the same process) share the same AsyncLocalStorage
// instance — otherwise transactions set by one copy are invisible to the other.
declare global {
  // eslint-disable-next-line no-var
  var __cedarDbStorage: AsyncLocalStorage<DbStore> | undefined;
}
globalThis.__cedarDbStorage ??= new AsyncLocalStorage<DbStore>();
const dbAsyncLocalStorage = globalThis.__cedarDbStorage;

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

/** Thrown inside the savepoint callback to make Knex roll the savepoint back.
 * An `Error` subclass, because Knex replaces non-Error rejections. */
class SavepointRollback extends Error {}

/**
 * Runs one tRPC procedure in a savepoint of the current transaction. Use it as
 * the first middleware of every procedure:
 *
 * ```ts
 * const baseProcedure = t.procedure.use(
 *   t.middleware(({ next }) => runInSavepoint(() => next())),
 * );
 * ```
 *
 * A request's transaction commits even when a procedure fails, because tRPC
 * turns the error into a response instead of rethrowing it (and one HTTP
 * request can carry several batched procedures). The savepoint makes a failed
 * procedure undo its own writes, including a `pokeWorkspace` NOTIFY, while the
 * other procedures in the batch keep theirs. It also recovers the transaction
 * after a SQL error, which would otherwise abort every later statement in it.
 *
 * tRPC's `next()` does not throw for a failed procedure; it resolves to
 * `{ ok: false }`. That result is returned unchanged, so tRPC still sends the
 * error. Without a current transaction (e.g. outside a request), `next` runs
 * as is.
 */
export async function runInSavepoint<R extends { ok: boolean }>(
  next: () => Promise<R>,
): Promise<R> {
  const store = dbAsyncLocalStorage.getStore();
  if (!store?.trx) return next();

  const { db, trx } = store;
  let result: R | undefined;
  try {
    await trx.transaction(async (savepoint) => {
      result = await dbAsyncLocalStorage.run({ db, trx: savepoint }, next);
      if (!result.ok) throw new SavepointRollback();
    });
  } catch (error) {
    if (!(error instanceof SavepointRollback)) throw error;
  }
  return result as R;
}

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
