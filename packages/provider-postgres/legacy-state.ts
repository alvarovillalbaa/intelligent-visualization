import type { RepositoryState } from "@/lib/types"
import type { LegacyRepository } from "@/packages/backend-contracts/legacy-repository"
import { postgresSchema, type PostgresContext } from "./context"

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

export async function withLegacyRepositoryState<T>(
  work: (state: RepositoryState) => T | Promise<T>,
  context: PostgresContext,
): Promise<T> {
  await context.ensure()
  const database = context.database, SCHEMA = postgresSchema(context.schema)
  return database.transaction(async (transaction) => {
    const { rows } = await transaction.query(
      `SELECT payload FROM ${SCHEMA}.legacy_repository_state WHERE key = $1 FOR UPDATE`,
      [LEGACY_REPOSITORY_KEY],
    )
    if (rows.length !== 1) {
      throw new Error(`The legacy repository is not initialized. Run the explicit ${context.kind === "local" ? "local " : ""}setup command first.`)
    }
    const state = decodeState(rows[0].payload)
    const result = await work(state)
    const updated = await transaction.query(
      `UPDATE ${SCHEMA}.legacy_repository_state SET payload = $2::jsonb, updated_at = $3 WHERE key = $1`,
      [LEGACY_REPOSITORY_KEY, JSON.stringify(state), new Date().toISOString()],
    )
    if (updated.rowCount !== 1) throw new Error("The legacy repository state could not be saved.")
    return result
  })
}

export function createLegacyRepository(context: PostgresContext): LegacyRepository {
  return { withState: (work) => withLegacyRepositoryState(work, context) }
}
