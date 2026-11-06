import { draftJson } from "@/lib/workspace-draft-http"
import { publicationFailure, readWorkspaceUnpublicationInput, workspacePublicationPathId } from "@/lib/workspace-publication-http"
import { unpublishWorkspaceDraft } from "@/lib/workspace-publications"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

type Context = { params: Promise<{ workspaceSlug: string; visualizationId: string }> }

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, visualizationId } = await context.params
    if (new URL(request.url).search || !workspacePublicationPathId.safeParse(visualizationId).success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
    const body = await readWorkspaceUnpublicationInput(request)
    const result = await unpublishWorkspaceDraft(workspaceSlug, { id: visualizationId, ...body })
    return draftJson(result, result.status === "conflict" ? 409 : 200)
  } catch (error) { return publicationFailure(error, "unpublish") }
}
