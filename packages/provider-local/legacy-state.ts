import type { RepositoryState } from "@/lib/types"
import { LEGACY_REPOSITORY_KEY, withLegacyRepositoryState as withPostgresLegacyRepositoryState } from "@/packages/provider-postgres/legacy-state"
import { createLocalPostgresContext, getLocalDatabase, type LocalDatabase } from "./database"
import { LOCAL_SCHEMA } from "./schema"

export { LEGACY_REPOSITORY_KEY } from "@/packages/provider-postgres/legacy-state"

// Setup calls this explicitly. An existing repository is never replaced.
export async function seedLegacyRepository(database: LocalDatabase): Promise<void> {
  const { createSeedState } = await import("@/lib/seed")
  await database.query(
    `INSERT INTO ${LOCAL_SCHEMA}.legacy_repository_state (key, payload, updated_at)
     VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO NOTHING`,
    [LEGACY_REPOSITORY_KEY, JSON.stringify(createSeedState()), new Date().toISOString()],
  )
}

export function withLegacyRepositoryState<T>(
  work: (state: RepositoryState) => T | Promise<T>,
  database: LocalDatabase = getLocalDatabase(),
): Promise<T> {
  return withPostgresLegacyRepositoryState(work, createLocalPostgresContext(database))
}
