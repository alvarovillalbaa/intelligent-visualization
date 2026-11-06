import { randomUUID } from "node:crypto"
import { Pool } from "pg"

import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { createPostgresDatabase } from "@/packages/provider-local/database"

const ADMIN_URL = "postgresql://iv_ci:authored-ci-only@127.0.0.1:54431/postgres"

export async function createPostgresFixture() {
  if (process.env.IV_POSTGRES_FIXTURES !== "disposable" || process.env.IV_POSTGRES_TEST_ADMIN_URL !== ADMIN_URL) {
    throw new Error("Provider checks require the explicitly configured disposable PostgreSQL service.")
  }
  const name = `iv_check_${randomUUID().replaceAll("-", "")}`
  const marker = `iv-postgres-fixture:${randomUUID()}`
  const admin = new Pool({ connectionString: ADMIN_URL, max: 1, connectionTimeoutMillis: 5000, query_timeout: 10000 })
  let created = false
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    created = true
    await admin.query(`COMMENT ON DATABASE "${name}" IS '${marker}'`)
    const url = new URL(ADMIN_URL)
    url.pathname = `/${name}`
    const connectionString = url.toString()
    const database = createPostgresDatabase(connectionString)
    const provider = createLocalPersistenceProvider({ connectionString })
    try {
      await provider.health()
    } catch (error) {
      await database.close()
      await provider.close()
      throw error
    }
    let disposed = false
    return {
      connectionString, database, provider,
      async dispose() {
        if (disposed) return
        await provider.close()
        await database.close()
        const row = (await admin.query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=$1", [name])).rows[0]
        if (row?.marker !== marker) throw new Error("Disposable PostgreSQL fixture ownership changed; drop refused.")
        const active = (await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1", [name])).rows[0].count
        if (active !== 0) throw new Error("Disposable PostgreSQL fixture has active clients; drop refused.")
        await admin.query(`DROP DATABASE "${name}"`)
        disposed = true
        await admin.end()
        console.log(`IV_POSTGRES_FIXTURE_RELEASED ${name}`)
      },
    }
  } catch (error) {
    if (created) {
      const row = (await admin.query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=$1", [name])).rows[0]
      const active = (await admin.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1", [name])).rows[0].count
      if (row?.marker === marker && active === 0) await admin.query(`DROP DATABASE "${name}"`)
    }
    await admin.end()
    throw error
  }
}

export async function withPostgresFixture<T>(work: (fixture: Awaited<ReturnType<typeof createPostgresFixture>>) => Promise<T>) {
  const fixture = await createPostgresFixture()
  let result: T | undefined
  let primary: unknown
  try { result = await work(fixture) } catch (error) { primary = error }
  let cleanup: unknown
  try { await fixture.dispose() } catch (error) { cleanup = error }
  if (primary && cleanup) throw new AggregateError([primary, cleanup], "PostgreSQL check and owned cleanup both failed.")
  if (primary) throw primary
  if (cleanup) throw cleanup
  return result as T
}
