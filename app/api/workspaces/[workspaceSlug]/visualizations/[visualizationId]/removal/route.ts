import { draftJson } from "@/lib/workspace-draft-http"
import { readWorkspaceRemovalInput, removalFailure, removalUuid } from "@/lib/workspace-removal-http"
import { getWorkspaceRemovalReview, removeWorkspaceDraft } from "@/lib/workspace-removals"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

type Context = { params: Promise<{ workspaceSlug: string; visualizationId: string }> }
async function target(request: Request, context: Context) {
  const params = await context.params
  if (new URL(request.url).search || !removalUuid.safeParse(params.visualizationId).success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
  return params
}
export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug, visualizationId } = await target(request, context)
    const review = await getWorkspaceRemovalReview(workspaceSlug, visualizationId)
    if (!review) throw new WorkspaceDraftAccessError("NOT_FOUND")
    return draftJson(review)
  } catch (error) { return removalFailure(error) }
}
export async function POST(request: Request, context: Context) {
  try {
    const { workspaceSlug, visualizationId } = await target(request, context)
    const input = await readWorkspaceRemovalInput(request)
    const result = await removeWorkspaceDraft(workspaceSlug, { id: visualizationId, ...input })
    return draftJson(result, result.status === "conflict" ? 409 : 200)
  } catch (error) { return removalFailure(error) }
}
