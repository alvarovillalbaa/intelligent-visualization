import { AsyncLocalStorage } from "node:async_hooks"
import { Pool, type PoolClient } from "pg"

import { LOCAL_SCHEMA, LOCAL_SCHEMA_VERSION, localMigrations } from "./schema"

export { LOCAL_SCHEMA } from "./schema"

export interface LocalQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface LocalDatabase {
  query(sql: string, args?: readonly unknown[]): Promise<LocalQueryResult>
  transaction<T>(work: (database: LocalDatabase) => Promise<T>): Promise<T>
  close(): Promise<void>
}

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
  const pool = new Pool({
    connectionString: localConnectionString(connectionString), max: 4,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    statement_timeout: 10000, query_timeout: 15000, lock_timeout: 5000,
    application_name: "intelligent-visualization-local", options: "-c search_path=pg_catalog",
  })
  // Context belongs to this pool, so concurrent provider instances cannot share a client.
  const context = new AsyncLocalStorage<PoolClient>()
  let savepointSequence = 0
  let closing: Promise<void> | undefined
  const database: LocalDatabase = {
    async query(sql, args = []) {
      if (closing) throw new Error("The local PostgreSQL connection is closed.")
      const executor = context.getStore() ?? pool
      const result = await executor.query(sql, [...args])
      return { rows: result.rows, rowCount: result.rowCount ?? 0 }
    },
    async transaction(work) {
      if (closing) throw new Error("The local PostgreSQL connection is closed.")
      const active = context.getStore()
      if (active) {
        const savepoint = `local_nested_${++savepointSequence}`
        await active.query(`SAVEPOINT ${savepoint}`)
        try {
          const result = await work(database)
          await active.query(`RELEASE SAVEPOINT ${savepoint}`)
          return result
        } catch (error) {
          await active.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          await active.query(`RELEASE SAVEPOINT ${savepoint}`)
          throw error
        }
      }
      const client = await pool.connect()
      let releaseError: Error | undefined
      try {
        await client.query("BEGIN")
        const result = await context.run(client, () => work(database))
        await client.query("COMMIT")
        return result
      } catch (error) {
        try { await client.query("ROLLBACK") } catch { releaseError = new Error("Local PostgreSQL rollback failed.") }
        throw error
      } finally {
        client.release(releaseError)
      }
    },
    async close() {
      if (context.getStore()) throw new Error("Cannot close local PostgreSQL during a transaction.")
      closing ??= pool.end()
      await closing
    },
  }
  pool.on("error", () => { initialized.delete(database) })
  return database
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
