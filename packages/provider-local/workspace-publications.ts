import type { PersistenceProvider } from "@/packages/backend-contracts/provider"
import { createWorkspacePublicationRepository as createPostgresWorkspacePublicationRepository } from "@/packages/provider-postgres/workspace-publications"
import { createLocalPostgresContext, type LocalDatabase } from "./database"

export function createWorkspacePublicationRepository(database: LocalDatabase, provider: Pick<PersistenceProvider, "visualizations">) {
  return createPostgresWorkspacePublicationRepository(createLocalPostgresContext(database), provider)
}
