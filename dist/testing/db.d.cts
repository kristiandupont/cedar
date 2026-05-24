import { Knex } from "knex";

//#region src/testing/get-knex-for.d.ts
declare function getKnexFor(knexConfig: Knex.Config, database: string): Knex;
//#endregion
export { getKnexFor };
//# sourceMappingURL=db.d.cts.map