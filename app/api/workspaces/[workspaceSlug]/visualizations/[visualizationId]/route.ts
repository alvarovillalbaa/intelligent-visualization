import { draftFailure, draftJson } from "@/lib/workspace-draft-http"
import { getWorkspaceDraft } from "@/lib/workspace-drafts"

export async function GET(request: Request, context: { params: Promise<{ workspaceSlug: string; visualizationId: string }> }) {
  try {
    if (new URL(request.url).search) return draftJson({ code: "INVALID_INPUT", error: "Invalid draft URL." }, 400)
    const { workspaceSlug, visualizationId } = await context.params
    const draft = await getWorkspaceDraft(workspaceSlug, visualizationId)
    return draft ? draftJson(draft) : draftJson({ code: "NOT_FOUND", error: "This workspace draft is unavailable." }, 404)
  } catch (error) { return draftFailure(error) }
}
