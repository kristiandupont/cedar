import { Knex } from "knex";

//#region src/testing/get-knex-for.d.ts
declare function getKnexFor(knexConfig: Knex.Config, database: string): Knex;
//#endregion
//#region src/testing/index.d.ts
declare function useTestDatabase(config: {
  templateDbName: string;
  knexConfig: Knex.Config;
  preserveAfterTest?: boolean;
}): {
  getDb: () => Knex;
  inTrx: <R>(cb: (...args: any) => Promise<R>) => Promise<R>;
};
//#endregion
export { getKnexFor, useTestDatabase };
//# sourceMappingURL=testing.d.mts.map