import type { PersistenceKind } from "@/packages/backend-contracts/provider"
import type { PostgresDatabase } from "./database"

export type PostgresSchema = "intelligent_visualization_local" | "intelligent_visualization_supabase"

export function postgresSchema(value: PostgresSchema): PostgresSchema {
  if (value !== "intelligent_visualization_local" && value !== "intelligent_visualization_supabase") {
    throw new Error("Unknown PostgreSQL provider schema.")
  }
  return value
}

export interface PostgresContext {
  readonly kind: PersistenceKind
  readonly database: PostgresDatabase
  readonly schema: PostgresSchema
  readonly ensure: () => Promise<void>
}
