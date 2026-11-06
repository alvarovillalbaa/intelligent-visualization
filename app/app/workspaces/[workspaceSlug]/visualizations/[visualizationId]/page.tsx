import { notFound } from "next/navigation"
import { SavedDraftEditor } from "@/components/visualizations/saved-draft-editor"
import { requireSessionUser } from "@/lib/server-auth"
import { getWorkspaceDraft } from "@/lib/workspace-drafts"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

export default async function SavedVisualizationPage({ params }: { params: Promise<{ workspaceSlug: string; visualizationId: string }> }) {
  const sessionUser = await requireSessionUser()
  const { workspaceSlug, visualizationId } = await params
  let draft
  try { draft = await getWorkspaceDraft(workspaceSlug, visualizationId) }
  catch (error) {
    if (error instanceof WorkspaceDraftAccessError && ["NOT_FOUND", "UNAUTHENTICATED"].includes(error.code)) notFound()
    throw error
  }
  if (!draft) notFound()
  return <SavedDraftEditor key={draft.id} initial={draft} canEdit={sessionUser.role !== "viewer"} />
}
