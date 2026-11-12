import { createLookupHash } from "@/lib/auth"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { getSessionToken } from "@/lib/server-auth"
import { WorkspaceDraftAccessError, type SaveWorkspaceDraftInput } from "@/packages/backend-contracts/workspace-drafts"

async function currentAccess(workspaceSlug: string) {
  const token = await getSessionToken()
  if (!token) throw new WorkspaceDraftAccessError("UNAUTHENTICATED")
  return { tokenHash: createLookupHash(token), workspaceSlug }
}

export async function listWorkspaceDrafts(workspaceSlug: string, cursor?: string | null) {
  const access = await currentAccess(workspaceSlug)
  return (await getPersistenceProvider()).workspaceDrafts.list(access, cursor)
}

export async function getWorkspaceDraft(workspaceSlug: string, id: string) {
  const access = await currentAccess(workspaceSlug)
  return (await getPersistenceProvider()).workspaceDrafts.get(access, id)
}

export async function saveWorkspaceDraft(workspaceSlug: string, input: SaveWorkspaceDraftInput) {
  const access = await currentAccess(workspaceSlug)
  return (await getPersistenceProvider()).workspaceDrafts.save(access, input)
}
