import { draftFailure, draftJson, readWorkspaceDraftInput } from "@/lib/workspace-draft-http"
import { listWorkspaceDrafts, saveWorkspaceDraft } from "@/lib/workspace-drafts"
import type { SaveWorkspaceDraftInput } from "@/packages/backend-contracts/workspace-drafts"

type Context = { params: Promise<{ workspaceSlug: string }> }

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceSlug } = await context.params
    const url = new URL(request.url)
    if ([...url.searchParams.keys()].some((key) => key !== "after") || url.searchParams.getAll("after").length > 1) {
      return draftJson({ code: "INVALID_INPUT", error: "Invalid draft page." }, 400)
    }
    return draftJson(await listWorkspaceDrafts(workspaceSlug, url.searchParams.get("after")))
  } catch (error) { return draftFailure(error) }
}

export async function POST(request: Request, context: Context) {
  try {
    if (new URL(request.url).search) return draftJson({ code: "INVALID_INPUT", error: "Invalid draft save URL." }, 400)
    const { workspaceSlug } = await context.params
    const input = await readWorkspaceDraftInput(request)
    const result = await saveWorkspaceDraft(workspaceSlug, input as SaveWorkspaceDraftInput)
    return draftJson(result, result.status === "conflict" ? 409 : 200)
  } catch (error) { return draftFailure(error) }
}
