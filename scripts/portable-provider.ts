import type { PostgresContext } from "@/packages/provider-postgres/context"

export async function openPortableProvider(kind: string): Promise<PostgresContext> {
  if (kind === "local") {
    const { createPostgresDatabase, createLocalPostgresContext } = await import("@/packages/provider-local/database")
    return createLocalPostgresContext(createPostgresDatabase())
  }
  if (kind === "supabase") {
    const { createSupabaseDatabase } = await import("@/packages/provider-supabase/database")
    const { createSupabasePostgresContext } = await import("@/packages/provider-supabase/adapter")
    return createSupabasePostgresContext(createSupabaseDatabase())
  }
  throw new Error("Portable data tools require --provider local or --provider supabase.")
}
