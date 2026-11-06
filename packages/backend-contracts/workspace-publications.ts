import type { WorkspaceDraftAccess, WorkspaceDraftDocument, WorkspaceDraftKind } from "./workspace-drafts"

export const WORKSPACE_PUBLICATION_NAMESPACE = "canonical-publications"

export interface WorkspacePublishedVersion {
  publicId: string
  versionId: string
  sourceRevision: number
  documentHash: string
  artifactHash: string
  createdAt: string
  title: string
  publicUrl: string
  versionUrl: string
}

export interface WorkspacePublicationState {
  id: string
  workspaceSlug: string
  kind: WorkspaceDraftKind
  draftRevision: number
  draftHash: string
  current: WorkspacePublishedVersion | null
}

export interface PublishWorkspaceDraftInput {
  id: string
  requestId: string
  versionId: string
  expectedRevision: number
  expectedDraftHash: string
}

export interface WorkspacePublicationResult {
  status: "published" | "conflict"
  state: WorkspacePublicationState
  receipt: {
    requestId: string
    versionId: string
    status: "published" | "conflict"
    acceptedRevision: number | null
    documentHash: string
    publication: WorkspacePublishedVersion | null
  }
}

// Server-only staging identity. No actor or storage key comes from the HTTP body.
export interface WorkspacePublicationBinding {
  actorId: string
  teamId: string
  workspaceId: string
  visualizationId: string
  publicId: string
  kind: WorkspaceDraftKind
  requestId: string
  versionId: string
  expectedRevision: number
  expectedDraftHash: string
}

export interface PreparedWorkspacePublication {
  status: "ready"
  preparedAt: string
  state: WorkspacePublicationState
  binding: WorkspacePublicationBinding
  artifactStorageKey: string
  document: WorkspaceDraftDocument
}

export interface WorkspacePublicationArtifact {
  storageKey: string
  storageHash: string
  artifactHash: string
  manifest: Record<string, unknown>
}

export interface PublicWorkspaceArtifact {
  publicId: string
  versionId: string
  kind: WorkspaceDraftKind
  storageKey: string
  storageHash: string
  storageBytes: number
  artifactHash: string
  documentHash: string
  manifest: Record<string, unknown>
}

export interface WorkspacePublicationRepository {
  get(access: WorkspaceDraftAccess, id: string): Promise<WorkspacePublicationState | null>
  prepare(access: WorkspaceDraftAccess, input: PublishWorkspaceDraftInput): Promise<PreparedWorkspacePublication | WorkspacePublicationResult>
  commit(access: WorkspaceDraftAccess, input: PublishWorkspaceDraftInput, artifact: WorkspacePublicationArtifact): Promise<WorkspacePublicationResult>
  resolve(publicId: string, versionId?: string): Promise<PublicWorkspaceArtifact | null>
}

export class WorkspacePublicationArtifactError extends Error {
  constructor() {
    super("The publication artifact could not be verified. Retry the same publication before starting another.")
    this.name = "WorkspacePublicationArtifactError"
  }
}
