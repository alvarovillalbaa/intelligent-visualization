import { createPostgresDatabase as createNativePostgresDatabase, type PostgresDatabase, type PostgresQueryResult } from "@/packages/provider-postgres/database"
import type { PostgresContext } from "@/packages/provider-postgres/context"
import { LOCAL_SCHEMA, LOCAL_SCHEMA_VERSION, localMigrations } from "./schema"

export { LOCAL_SCHEMA } from "./schema"
export type LocalDatabase = PostgresDatabase
export type LocalQueryResult = PostgresQueryResult

export function localConnectionString(connectionString = process.env.LOCAL_DATABASE_URL): string {
  if (!connectionString) throw new Error("LOCAL_DATABASE_URL is required for local PostgreSQL persistence.")
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error("LOCAL_DATABASE_URL must be a PostgreSQL connection URL.")
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !url.pathname.slice(1)
    || [...url.searchParams.keys()].some((key) => !["sslmode", "application_name", "connect_timeout"].includes(key))) {
    throw new Error("Local PostgreSQL requires a loopback PostgreSQL URL with a database name; remote hosts and connection overrides are not allowed.")
  }
  return connectionString
}

export function createPostgresDatabase(connectionString?: string): LocalDatabase {
  return createNativePostgresDatabase({
    connectionString: localConnectionString(connectionString), max: 4,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    statement_timeout: 10000, query_timeout: 15000, lock_timeout: 5000,
    application_name: "intelligent-visualization-local", options: "-c search_path=pg_catalog",
  }, (database) => { initialized.delete(database) })
}

export function createLocalPostgresContext(database: LocalDatabase): PostgresContext {
  return { kind: "local", database, schema: LOCAL_SCHEMA, ensure: () => initializeLocalDatabase(database) }
}

const initialized = new WeakMap<LocalDatabase, Promise<void>>()

export async function initializeLocalDatabase(database: LocalDatabase): Promise<void> {
  let initialization = initialized.get(database)
  if (!initialization) {
    initialization = database.transaction(async (transaction) => {
      await transaction.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${LOCAL_SCHEMA}:schema`])
      const existingTables = (await transaction.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1", [LOCAL_SCHEMA])).rows
      if (existingTables.length && !existingTables.some((row) => row.tablename === "schema_migrations")) {
        throw new Error("An unversioned local PostgreSQL namespace cannot be adopted automatically.")
      }
      await transaction.query(`CREATE SCHEMA IF NOT EXISTS ${LOCAL_SCHEMA}`)
      await transaction.query(`CREATE TABLE IF NOT EXISTS ${LOCAL_SCHEMA}.schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL)`)
      const { rows } = await transaction.query(`SELECT version, name FROM ${LOCAL_SCHEMA}.schema_migrations ORDER BY version`)
      if (!rows.length && existingTables.some((row) => row.tablename !== "schema_migrations")) {
        throw new Error("An unversioned local PostgreSQL namespace cannot be adopted automatically.")
      }
      for (const row of rows) {
        const expected = localMigrations.find((migration) => migration.version === Number(row.version))
        if (!expected || expected.name !== row.name || Number(row.version) > LOCAL_SCHEMA_VERSION) {
          throw new Error("Local PostgreSQL schema has an unknown migration version or identity.")
        }
      }
      for (const migration of localMigrations) {
        if (rows.some((row) => Number(row.version) === migration.version)) continue
        for (const statement of migration.statements) await transaction.query(statement)
        await transaction.query(`INSERT INTO ${LOCAL_SCHEMA}.schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)`, [migration.version, migration.name, new Date().toISOString()])
      }
    })
    initialized.set(database, initialization)
  }
  try {
    await initialization
  } catch (error) {
    if (initialized.get(database) === initialization) initialized.delete(database)
    throw error
  }
}

let singleton: { connectionString: string; database: LocalDatabase } | undefined

export function getLocalDatabase(): LocalDatabase {
  const connectionString = localConnectionString()
  if (singleton && singleton.connectionString !== connectionString) {
    throw new Error("LOCAL_DATABASE_URL changed after initialization; restart the process to select another database.")
  }
  singleton ??= { connectionString, database: createPostgresDatabase(connectionString) }
  return singleton.database
}
