import { createLookupHash } from "@/lib/auth"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { getSessionToken } from "@/lib/server-auth"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"
import type { RemoveWorkspaceDraftInput } from "@/packages/backend-contracts/workspace-removals"

async function access(workspaceSlug: string) {
  const token = await getSessionToken()
  if (!token) throw new WorkspaceDraftAccessError("UNAUTHENTICATED")
  return { tokenHash: createLookupHash(token), workspaceSlug }
}
export async function getWorkspaceRemovalReview(workspaceSlug: string, id: string) {
  const current = await access(workspaceSlug)
  return (await getPersistenceProvider()).workspaceRemovals.get(current, id)
}
export async function removeWorkspaceDraft(workspaceSlug: string, input: RemoveWorkspaceDraftInput) {
  const current = await access(workspaceSlug)
  return (await getPersistenceProvider()).workspaceRemovals.remove(current, input)
}
