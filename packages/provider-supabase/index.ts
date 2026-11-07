export const supabaseProviderStatus = {
  kind: "supabase",
  implemented: false,
  note: "Supabase source is authored behind the provider contract; selection remains disabled until shared contract acceptance.",
} as const

export { createSupabasePersistenceProvider, createSupabasePersistenceProviderForDatabase, createSupabasePostgresContext, SupabasePersistenceProvider } from "./adapter"
export { createSupabaseDatabase, supabaseConnectionString } from "./database"
export { ensureSupabaseDatabase, SUPABASE_SCHEMA } from "./schema"
