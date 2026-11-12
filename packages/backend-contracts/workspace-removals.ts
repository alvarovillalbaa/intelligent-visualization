import type { VisualizationStatus } from "@/packages/domain/entities"
import type { WorkspaceDraftAccess, WorkspaceDraftKind } from "./workspace-drafts"

export type ActiveVisualizationStatus = Exclude<VisualizationStatus, "removed">
export interface RemovalExpected {
  draftRevision: number
  draftHash: string
  status: ActiveVisualizationStatus
  publishedVersionId: string | null
}
export interface WorkspaceRemovalReview extends RemovalExpected {
  id: string
  kind: WorkspaceDraftKind
  title: string
}
export interface RemoveWorkspaceDraftInput {
  id: string
  requestId: string
  expected: RemovalExpected
}
export interface WorkspaceRemovalResult {
  status: "removed" | "conflict"
  current: Omit<RemovalExpected, "status"> & { id: string; status: VisualizationStatus }
  receipt: { requestId: string; status: "removed" | "conflict"; removedAt: string | null }
}
export interface WorkspaceRemovalRepository {
  get(access: WorkspaceDraftAccess, id: string): Promise<WorkspaceRemovalReview | null>
  remove(access: WorkspaceDraftAccess, input: RemoveWorkspaceDraftInput): Promise<WorkspaceRemovalResult>
}
