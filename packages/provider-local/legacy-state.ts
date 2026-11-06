import type { RepositoryState } from "@/lib/types"
import { getLocalDatabase, type LocalDatabase } from "./database"
import { LOCAL_SCHEMA } from "./schema"

export const LEGACY_REPOSITORY_KEY = "legacy-slides"

const stateCollections = ["users", "sessions", "teams", "workspaces", "decks", "events", "leads", "invites"] as const

function decodeState(payload: unknown): RepositoryState {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The legacy repository state is invalid.")
  }
  const record = payload as Record<string, unknown>
  if (Object.keys(record).length !== stateCollections.length || stateCollections.some((key) =>
    !Array.isArray(record[key]) || record[key].some((entry: unknown) =>
      !entry || typeof entry !== "object" || Array.isArray(entry)))) {
    throw new Error("The legacy repository state is invalid.")
  }
  return record as unknown as RepositoryState
}

// Setup calls this explicitly. An existing repository is never replaced.
export async function seedLegacyRepository(database: LocalDatabase): Promise<void> {
  const { createSeedState } = await import("@/lib/seed")
  await database.query(
    `INSERT INTO ${LOCAL_SCHEMA}.legacy_repository_state (key, payload, updated_at)
     VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO NOTHING`,
    [LEGACY_REPOSITORY_KEY, JSON.stringify(createSeedState()), new Date().toISOString()],
  )
}

export async function withLegacyRepositoryState<T>(
  work: (state: RepositoryState) => T | Promise<T>,
  database: LocalDatabase = getLocalDatabase(),
): Promise<T> {
  return database.transaction(async (transaction) => {
    const { rows } = await transaction.query(
      `SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = $1 FOR UPDATE`,
      [LEGACY_REPOSITORY_KEY],
    )
    if (rows.length !== 1) {
      throw new Error("The legacy repository is not initialized. Run the explicit local setup command first.")
    }
    const state = decodeState(rows[0].payload)
    const result = await work(state)
    const updated = await transaction.query(
      `UPDATE ${LOCAL_SCHEMA}.legacy_repository_state SET payload = $2::jsonb, updated_at = $3 WHERE key = $1`,
      [LEGACY_REPOSITORY_KEY, JSON.stringify(state), new Date().toISOString()],
    )
    if (updated.rowCount !== 1) throw new Error("The legacy repository state could not be saved.")
    return result
  })
}
