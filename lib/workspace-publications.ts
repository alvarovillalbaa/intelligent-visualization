import { createLookupHash } from "@/lib/auth"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { getSessionToken } from "@/lib/server-auth"
import { getStorageAdapter } from "@/lib/storage/factory"
import { readWorkspacePublication, stageWorkspacePublication } from "@/lib/artifacts/publication"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"
import type { PublishWorkspaceDraftInput, UnpublishWorkspaceDraftInput } from "@/packages/backend-contracts/workspace-publications"

async function currentAccess(workspaceSlug: string) {
  const token = await getSessionToken()
  if (!token) throw new WorkspaceDraftAccessError("UNAUTHENTICATED")
  return { tokenHash: createLookupHash(token), workspaceSlug }
}

export async function getWorkspacePublicationState(workspaceSlug: string, id: string) {
  const access = await currentAccess(workspaceSlug)
  return (await getPersistenceProvider()).workspacePublications.get(access, id)
}

export async function publishWorkspaceDraft(workspaceSlug: string, input: PublishWorkspaceDraftInput) {
  const access = await currentAccess(workspaceSlug)
  const provider = await getPersistenceProvider()
  const prepared = await provider.workspacePublications.prepare(access, input)
  if (prepared.status !== "ready") return prepared
  const artifact = await stageWorkspacePublication(await getStorageAdapter(), prepared)
  return provider.workspacePublications.commit(access, input, artifact)
}

export async function unpublishWorkspaceDraft(workspaceSlug: string, input: UnpublishWorkspaceDraftInput) {
  const access = await currentAccess(workspaceSlug)
  return (await getPersistenceProvider()).workspacePublications.unpublish(access, input)
}

export async function getPublicWorkspaceArtifact(publicId: string, versionId?: string) {
  const reference = await (await getPersistenceProvider()).workspacePublications.resolve(publicId, versionId)
  if (!reference) return null
  const artifact = await readWorkspacePublication(await getStorageAdapter(), reference)
  return { reference, ...artifact }
}
