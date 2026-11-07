// T3: only the controller's marked, disposable local Supabase stack.
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresDatabase } from "@/packages/provider-postgres/database"
import { createSupabasePersistenceProviderForDatabase, createSupabasePostgresContext } from "@/packages/provider-supabase/adapter"
import { SUPABASE_SCHEMA, SUPABASE_TABLES } from "@/packages/provider-supabase/schema"
import { createSupabaseStorageAdapter } from "@/packages/provider-supabase/storage"

export const SUPABASE_FIXTURE_ORIGIN = "https://iv-supabase.fixture.invalid"
const API = "http://127.0.0.1:54321"
const ADMIN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const RUNTIME = "postgresql://iv_runtime:authored-ci-runtime@127.0.0.1:54322/postgres"
const empty = { users: [], sessions: [], teams: [], workspaces: [], decks: [], events: [], leads: [], invites: [] }

export async function readFixtureValue(response: Response, limit = 65536): Promise<unknown> {
  if (!response.body) throw new Error("Fixture response body missing")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0, done = false
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) { done = true; break }
      size += part.value.length
      if (size > limit) throw new Error("Fixture response exceeds its bound")
      chunks.push(part.value)
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown
  } finally { if (!done) void reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function readFixtureJson(response: Response, limit = 65536): Promise<Record<string, unknown>> {
  const value = await readFixtureValue(response, limit)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Fixture response is not an object")
  return value as Record<string, unknown>
}

export async function createSupabaseFixture(reset = true) {
  if (process.env.CI !== "true" || process.env.IV_SUPABASE_CHECKS !== "disposable"
    || process.env.IV_SUPABASE_ADMIN_URL !== ADMIN || process.env.IV_SUPABASE_RUNTIME_URL !== RUNTIME
    || process.env.IV_SUPABASE_API_URL !== API || !/^[0-9a-f]{40}$/.test(process.env.SOURCE_COMMIT ?? "")) {
    throw new Error("Supabase fixture requires the explicitly owned disposable stack")
  }
  const serviceKey = process.env.IV_SUPABASE_SERVICE_KEY, anonKey = process.env.IV_SUPABASE_ANON_KEY
  if (!serviceKey || !anonKey) throw new Error("Disposable Supabase credentials are missing")
  const admin = new Pool({ connectionString: ADMIN, max: 1, connectionTimeoutMillis: 5000, query_timeout: 10000 })
  const database = createPostgresDatabase({ connectionString: RUNTIME, max: 1, connectionTimeoutMillis: 5000, query_timeout: 10000, statement_timeout: 10000 })
  const provider = createSupabasePersistenceProviderForDatabase(database), context = createSupabasePostgresContext(database)
  const keys = new Set<string>(), authUsers = new Set<string>(), prefix = "provider-checks/" + randomUUID() + "/"
  let closed = false
  async function request(pathname: string, init: RequestInit = {}) {
    if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("#")) throw new Error("Invalid owned fixture path")
    return fetch(API + pathname, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) })
  }
  // Transport-only fixture mapping. It forwards real HTTP arguments/responses;
  // production HTTPS/host validation remains unchanged and is not proved here.
  const transport: typeof fetch = async (input, init) => {
    if (input instanceof Request) throw new Error("Unsupported fixture transport input")
    const url = new URL(String(input))
    if (url.origin !== SUPABASE_FIXTURE_ORIGIN || !url.pathname.startsWith("/storage/v1/") || url.username || url.password || url.search || url.hash) throw new Error("Fixture transport escaped its owned storage origin")
    return fetch(API + url.pathname, init)
  }
  const storage = createSupabaseStorageAdapter({ url: SUPABASE_FIXTURE_ORIGIN, serviceRoleKey: serviceKey, bucket: "iv-private-checks" }, transport)
  async function resetApplication() {
    const client = await admin.connect()
    try {
      await client.query("BEGIN")
      const row = (await client.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0]
      if (row?.marker !== "iv-supabase-provider-ci:" + process.env.SOURCE_COMMIT) throw new Error("Disposable stack marker differs")
      const tables = SUPABASE_TABLES.filter((name) => name !== "schema_migrations")
      await client.query("TRUNCATE " + tables.map((name) => `${SUPABASE_SCHEMA}.${name}`).join(", ") + " CASCADE")
      await client.query(`INSERT INTO ${SUPABASE_SCHEMA}.legacy_repository_state(key,payload,updated_at) VALUES('legacy-slides',$1::jsonb,now())`, [JSON.stringify(empty)])
      await client.query("COMMIT")
    } catch (error) { await client.query("ROLLBACK"); throw error }
    finally { client.release() }
  }
  async function dispose() {
    if (closed) return
    const failures: string[] = []
    for (const key of keys) try {
      await storage.delete({ key })
      if (await storage.exists({ key })) throw new Error("Owned storage object remains")
      keys.delete(key)
    } catch { failures.push("Owned storage object cleanup failed") }
    for (const id of authUsers) try {
      const response = await request("/auth/v1/admin/users/" + id, { method: "DELETE", headers: { apikey: serviceKey!, Authorization: "Bearer " + serviceKey! } })
      if (!response.ok) throw new Error("Owned Auth user cleanup failed")
      await response.body?.cancel(); authUsers.delete(id)
    } catch { failures.push("Owned Auth user cleanup failed") }
    const results = await Promise.allSettled([provider.close(), admin.end()])
    if (results.some((row) => row.status === "rejected")) failures.push("Fixture pools did not close")
    closed = failures.length === 0
    if (failures.length) throw new Error(failures.join("; "))
    console.log("IV_SUPABASE_FIXTURE_CLOSED")
  }
  try {
    const marker = (await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker
    if (marker !== "iv-supabase-provider-ci:" + process.env.SOURCE_COMMIT) throw new Error("Disposable stack marker differs")
    if (reset) await resetApplication()
    await provider.health()
  } catch (error) { await Promise.allSettled([database.close(), admin.end()]); throw error }
  return { admin, database, provider, context, storage, transport, request, serviceKey, anonKey, prefix, keys, authUsers, resetApplication, dispose }
}

export async function withSupabaseFixture<T>(work: (fixture: Awaited<ReturnType<typeof createSupabaseFixture>>) => Promise<T>) {
  const fixture = await createSupabaseFixture()
  let result: T | undefined, primary: unknown, cleanup: unknown
  try { result = await work(fixture) } catch (error) { primary = error }
  try { await fixture.dispose() } catch (error) { cleanup = error }
  if (primary && cleanup) throw new AggregateError([primary, cleanup], "Supabase check and owned cleanup failed")
  if (primary) throw primary
  if (cleanup) throw cleanup
  return result as T
}
