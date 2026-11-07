import { PostgresPersistenceProvider } from "@/packages/provider-postgres/adapter"
import type { PostgresContext } from "@/packages/provider-postgres/context"
import type { PostgresDatabase } from "@/packages/provider-postgres/database"
import { createSupabaseDatabase } from "./database"
import { ensureSupabaseDatabase, SUPABASE_SCHEMA } from "./schema"

export function createSupabasePostgresContext(database: PostgresDatabase): PostgresContext {
  return { kind: "supabase", database, schema: SUPABASE_SCHEMA, ensure: () => ensureSupabaseDatabase(database) }
}

export class SupabasePersistenceProvider extends PostgresPersistenceProvider {
  readonly kind = "supabase" as const

  constructor(private readonly runtimeDatabase: PostgresDatabase = createSupabaseDatabase()) {
    super(createSupabasePostgresContext(runtimeDatabase))
  }

  async health() {
    await ensureSupabaseDatabase(this.runtimeDatabase, true)
    return super.health()
  }
}

export function createSupabasePersistenceProvider() {
  return new SupabasePersistenceProvider()
}

// Internal fixture/migration seam: injected databases still pass every installed
// schema and restricted-session-role check. Production URL policy is unchanged.
export function createSupabasePersistenceProviderForDatabase(database: PostgresDatabase) {
  return new SupabasePersistenceProvider(database)
}
