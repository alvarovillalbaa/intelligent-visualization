import { createPostgresDatabase, type PostgresDatabase } from "@/packages/provider-postgres/database"
import { invalidateSupabaseDatabase } from "./schema"

function invalidConnection(): never {
  throw new Error("SUPABASE_DATABASE_URL requires a trusted Supabase endpoint, iv_runtime credentials and verified TLS without URL overrides.")
}

export function supabaseConnectionString(value = process.env.SUPABASE_DATABASE_URL): string {
  if (!value || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" || process.env.PGOPTIONS) invalidConnection()
  let url: URL
  try { url = new URL(value) } catch { invalidConnection() }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password || url.pathname !== "/postgres" || url.search || url.hash) invalidConnection()
  const direct = /^db\.[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
    && url.port === "5432" && url.username === "iv_runtime"
  const pooled = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)
    && url.port === "6543" && /^iv_runtime\.[a-z0-9]{20}$/.test(url.username)
  if (!direct && !pooled) invalidConnection()
  try { if (decodeURIComponent(url.password).includes("\0")) invalidConnection() } catch { invalidConnection() }
  return value
}

export function createSupabaseDatabase(value?: string): PostgresDatabase {
  const url = new URL(supabaseConnectionString(value))
  // Explicit fields prevent URL SSL/query options from overriding certificate checks.
  // Queries use unnamed parameters, with one owned client for each transaction.
  return createPostgresDatabase({
    host: url.hostname, port: Number(url.port), database: "postgres",
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true, servername: url.hostname },
    max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    statement_timeout: 10000, query_timeout: 15000, lock_timeout: 5000,
    application_name: "intelligent-visualization-supabase", options: "",
  }, invalidateSupabaseDatabase)
}
