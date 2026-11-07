import { AsyncLocalStorage } from "node:async_hooks"
import { Pool, type PoolClient, type PoolConfig } from "pg"

export interface PostgresQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface PostgresDatabase {
  query(sql: string, args?: readonly unknown[]): Promise<PostgresQueryResult>
  transaction<T>(work: (database: PostgresDatabase) => Promise<T>): Promise<T>
  close(): Promise<void>
}

// Connection trust/TLS policy belongs to each provider, never to a caller's SQL.
export function createPostgresDatabase(options: PoolConfig, onPoolError?: (database: PostgresDatabase) => void): PostgresDatabase {
  const pool = new Pool(options)
  const context = new AsyncLocalStorage<PoolClient>()
  let savepointSequence = 0
  let closing: Promise<void> | undefined
  const database: PostgresDatabase = {
    async query(sql, args = []) {
      if (closing) throw new Error("The PostgreSQL connection is closed.")
      const executor = context.getStore() ?? pool
      const result = await executor.query(sql, [...args])
      return { rows: result.rows, rowCount: result.rowCount ?? 0 }
    },
    async transaction(work) {
      if (closing) throw new Error("The PostgreSQL connection is closed.")
      const active = context.getStore()
      if (active) {
        const savepoint = `provider_nested_${++savepointSequence}`
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
        try { await client.query("ROLLBACK") } catch { releaseError = new Error("PostgreSQL rollback failed.") }
        throw error
      } finally { client.release(releaseError) }
    },
    async close() {
      if (context.getStore()) throw new Error("Cannot close PostgreSQL during a transaction.")
      closing ??= pool.end()
      await closing
    },
  }
  pool.on("error", () => { onPoolError?.(database) })
  return database
}
