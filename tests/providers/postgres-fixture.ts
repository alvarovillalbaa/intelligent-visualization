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
  let databaseOid: string | undefined
  let databaseOwnerOid: string | undefined
  let database: ReturnType<typeof createPostgresDatabase> | undefined
  let provider: ReturnType<typeof createLocalPersistenceProvider> | undefined
  let disposal: Promise<void> | undefined
  function dispose(): Promise<void> {
    disposal ??= (async () => {
      const errors: unknown[] = []
      let drainStarted: number | undefined, drainFinished = false
      const evidence: { database: string; poolsConstructed: boolean[]; poolCloses: boolean[]; elapsedMs: number; sampleCount: number;
        samples: Array<{ elapsedMs: number; clients: Array<Record<string, unknown>> }>; metadataTruncated: boolean; zeroObserved: boolean;
        ownershipRechecked: boolean; dropped: boolean; adminClosed: boolean } = {
          database: name, poolsConstructed: [Boolean(provider), Boolean(database)], poolCloses: [], elapsedMs: 0, sampleCount: 0, samples: [], metadataTruncated: false,
          zeroObserved: false, ownershipRechecked: false, dropped: false, adminClosed: false,
        }
      try {
        const closed = await Promise.allSettled([
          Promise.resolve().then(() => provider?.close()),
          Promise.resolve().then(() => database?.close()),
        ])
        evidence.poolCloses = closed.map((result) => result.status === "fulfilled")
        for (const result of closed) if (result.status === "rejected") errors.push(result.reason)
        if (errors.length === 0 && created) {
          const client = await admin.connect()
          try {
            const start = performance.now(), deadline = start + 3000
            drainStarted = start
            let previous = ""
            while (true) {
              const remaining = deadline - performance.now()
              if (remaining <= 0) throw new Error("Disposable PostgreSQL fixture has active clients after bounded drain; drop refused.")
              // No transaction: each activity statement gets fresh session data.
              // The query timeout bounds even the last observation near deadline.
              const query = {
                text: `SELECT pid, backend_start, state, backend_type, usename, application_name, wait_event_type, wait_event
                  FROM pg_stat_activity WHERE datname=$1 ORDER BY pid LIMIT 17`,
                values: [name], query_timeout: Math.max(1, Math.min(500, Math.floor(remaining))),
              }
              const rows = (await client.query(query)).rows
              evidence.metadataTruncated ||= rows.length > 16
              const clients = rows.slice(0, 16).map((row: Record<string, unknown>) => Object.fromEntries(
                Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : typeof value === "string" ? value.slice(0, 128) : value]),
              ))
              evidence.elapsedMs = Math.round(performance.now() - start)
              evidence.sampleCount++
              const signature = JSON.stringify(clients)
              if (evidence.samples.length === 0 || rows.length === 0 || signature !== previous && evidence.samples.length < 7) {
                evidence.samples.push({ elapsedMs: evidence.elapsedMs, clients })
              } else if (signature !== previous) evidence.metadataTruncated = true
              previous = signature
              if (rows.length === 0) { evidence.zeroObserved = true; drainFinished = true; break }
              if (rows.length > 16) throw new Error("Disposable PostgreSQL fixture client metadata exceeds its bound; drop refused.")
              await new Promise<void>((resolve) => setTimeout(resolve, Math.max(1, Math.min(50, deadline - performance.now()))))
            }
            const row = (await client.query(`SELECT oid::text AS oid, datdba::text AS owner_oid, shobj_description(oid, 'pg_database') AS marker,
              (SELECT count(*)::int FROM pg_stat_activity WHERE datid=pg_database.oid) AS clients
              FROM pg_database WHERE datname=$1`, [name])).rows[0]
            if (!databaseOid || !databaseOwnerOid || row?.oid !== databaseOid || row.owner_oid !== databaseOwnerOid || row.marker !== marker) throw new Error("Disposable PostgreSQL fixture ownership changed; drop refused.")
            if (row.clients !== 0) throw new Error("Disposable PostgreSQL fixture has active clients at drop; drop refused.")
            evidence.ownershipRechecked = true
            await client.query(`DROP DATABASE "${name}"`)
            evidence.dropped = true
          } finally { client.release() }
        }
      } catch (error) {
        if (drainStarted !== undefined && !drainFinished) evidence.elapsedMs = Math.round(performance.now() - drainStarted)
        errors.push(error)
      }
      finally {
        try { await admin.end(); evidence.adminClosed = true } catch (error) { errors.push(error) }
        console.log(`IV_POSTGRES_FIXTURE_DRAIN ${JSON.stringify(evidence)}`)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1) throw new AggregateError(errors, "Disposable PostgreSQL fixture cleanup failed.")
      if (created) console.log(`IV_POSTGRES_FIXTURE_RELEASED ${name}`)
    })()
    return disposal
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    created = true
    await admin.query(`COMMENT ON DATABASE "${name}" IS '${marker}'`)
    const ownership = (await admin.query("SELECT oid::text AS oid, datdba::text AS owner_oid, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=$1", [name])).rows[0]
    if (!ownership || typeof ownership.oid !== "string" || !/^[1-9][0-9]{0,9}$/.test(ownership.oid)
      || typeof ownership.owner_oid !== "string" || !/^[1-9][0-9]{0,9}$/.test(ownership.owner_oid) || ownership.marker !== marker) {
      throw new Error("Disposable PostgreSQL fixture ownership could not be recorded.")
    }
    databaseOid = ownership.oid
    databaseOwnerOid = ownership.owner_oid
    const url = new URL(ADMIN_URL)
    url.pathname = `/${name}`
    const connectionString = url.toString()
    database = createPostgresDatabase(connectionString)
    provider = createLocalPersistenceProvider({ connectionString })
    await provider.health()
    return { connectionString, database, provider, dispose }
  } catch (primary) {
    try { await dispose() }
    catch (cleanup) { throw new AggregateError([primary, cleanup], "PostgreSQL fixture setup and owned cleanup both failed.") }
    throw primary
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
