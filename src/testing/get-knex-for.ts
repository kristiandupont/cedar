import type { Knex } from "knex";
import knex from "knex";

function getConnectionStringForDatabase(
  connectionString: string,
  database: string,
): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export function getKnexFor(knexConfig: Knex.Config, database: string): Knex {
  return knex({
    ...knexConfig,
    connection: getConnectionStringForDatabase(
      knexConfig.connection as string,
      database,
    ),
  });
}
