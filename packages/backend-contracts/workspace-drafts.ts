import type { Page, VisualizationDocument } from "@/packages/domain/entities"

export type WorkspaceDraftKind = "course" | "report"
export type WorkspaceDraftDocument = Extract<VisualizationDocument, { kind: WorkspaceDraftKind }>

export interface WorkspaceDraftSummary {
  id: string
  kind: WorkspaceDraftKind
  title: string
  summary: string
  draftRevision: number
  draftHash: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceDraft extends WorkspaceDraftSummary {
  workspaceSlug: string
  document: WorkspaceDraftDocument
}

export interface WorkspaceDraftAccess {
  tokenHash: string
  workspaceSlug: string
}

export interface SaveWorkspaceDraftInput {
  id: string
  requestId: string
  expectedRevision: number
  document: WorkspaceDraftDocument
}

export type SaveWorkspaceDraftResult = {
  status: "saved" | "conflict"
  draft: WorkspaceDraft
  receipt: {
    requestId: string
    status: "saved" | "conflict"
    acceptedRevision: number | null
    documentHash: string
  }
}

export class WorkspaceDraftAccessError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT") {
    super(code === "UNAUTHENTICATED" ? "Sign in to access workspace drafts."
      : code === "FORBIDDEN" ? "Your workspace role does not allow saving drafts."
        : code === "NOT_FOUND" ? "This workspace draft is unavailable."
          : "The workspace draft request is invalid.")
    this.name = "WorkspaceDraftAccessError"
  }
}

export interface WorkspaceDraftRepository {
  list(access: WorkspaceDraftAccess, cursor?: string | null, limit?: number): Promise<Page<WorkspaceDraftSummary>>
  get(access: WorkspaceDraftAccess, id: string): Promise<WorkspaceDraft | null>
  save(access: WorkspaceDraftAccess, input: SaveWorkspaceDraftInput): Promise<SaveWorkspaceDraftResult>
}
