import type { PersistenceProvider } from "@/packages/backend-contracts/provider"
import { createWorkspaceDraftRepository as createPostgresWorkspaceDraftRepository, verifyWorkspaceDraftProjection as verifyPostgresProjection } from "@/packages/provider-postgres/workspace-drafts"
import { createLocalPostgresContext, type LocalDatabase } from "./database"
import { LOCAL_SCHEMA } from "./schema"

export { authorizeWorkspaceDraftAccess, workspaceDraftInScope } from "@/packages/provider-postgres/workspace-drafts"
export type { WorkspaceDraftScope } from "@/packages/provider-postgres/workspace-drafts"

export function verifyWorkspaceDraftProjection(database: LocalDatabase, scope: Parameters<typeof verifyPostgresProjection>[1]) {
  return verifyPostgresProjection(database, scope, LOCAL_SCHEMA)
}

export function createWorkspaceDraftRepository(database: LocalDatabase, provider: Pick<PersistenceProvider, "visualizations">) {
  return createPostgresWorkspaceDraftRepository(createLocalPostgresContext(database), provider)
}
