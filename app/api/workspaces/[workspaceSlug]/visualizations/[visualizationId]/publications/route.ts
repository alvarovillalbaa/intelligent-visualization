import { draftJson } from "@/lib/workspace-draft-http"
import { publicationFailure, readWorkspacePublicationInput, workspacePublicationPathId } from "@/lib/workspace-publication-http"
import { getWorkspacePublicationState, publishWorkspaceDraft } from "@/lib/workspace-publications"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

type Context = { params: Promise<{ workspaceSlug: string; visualizationId: string }> }

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, visualizationId } = await context.params
    if (new URL(request.url).search || !workspacePublicationPathId.safeParse(visualizationId).success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
    const state = await getWorkspacePublicationState(workspaceSlug, visualizationId)
    return state ? draftJson(state) : draftJson({ code: "NOT_FOUND", error: "This workspace publication is unavailable." }, 404)
  } catch (error) { return publicationFailure(error) }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, visualizationId } = await context.params
    if (new URL(request.url).search || !workspacePublicationPathId.safeParse(visualizationId).success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
    const body = await readWorkspacePublicationInput(request)
    const result = await publishWorkspaceDraft(workspaceSlug, { id: visualizationId, ...body })
    return draftJson(result, result.status === "conflict" ? 409 : 200)
  } catch (error) { return publicationFailure(error) }
}
