import type {
  ExperimentStatus,
  Page,
  ProviderHealth,
  ReviewAnchor,
  Role,
  VisualizationDocument,
  VisualizationKind,
  VisualizationRecord,
  VisualizationStatus,
  VisualizationVersion,
} from "@/packages/domain/entities"

export type PersistenceKind = "local" | "convex" | "supabase" | "cloudflare"

export interface PersistenceCapabilities {
  transactions: boolean
  atomicPublish: boolean
  nativeRealtime: boolean
  nativeFileStorage: boolean
  fullTextSearch: boolean
  serverSidePagination: boolean
  compareAndSwap: boolean
  batchWrites: boolean
}

export interface ActorContext {
  userId: string
  teamId: string
  role: Role
}

export interface UserRecord {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: string
  updatedAt: string
}

export interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
}

export interface TeamRecord {
  id: string
  slug: string
  name: string
  brand: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MembershipRecord {
  teamId: string
  userId: string
  role: Role
  createdAt: string
}

export interface InviteRecord {
  id: string
  teamId: string
  workspaceId: string
  email: string
  invitedName: string
  role: Role
  tokenHash: string
  status: "pending" | "accepted" | "revoked"
  invitedByUserId: string
  createdAt: string
  acceptedAt: string | null
}

export interface WorkspaceRecord {
  id: string
  teamId: string
  slug: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface VisualizationCheckpointRecord {
  id: string
  visualizationId: string
  title: string
  summary: string
  prompt: string
  revision: number
  document: VisualizationDocument
  documentHash: string
  createdBy: string
  createdAt: string
}

export interface VisualizationSourceRecord {
  id: string
  visualizationId: string
  filenameOrUrl: string
  mime: string
  sizeBytes: number
  storageKey: string
  extractionState: "pending" | "ready" | "failed"
  extractedText: string | null
  structuredTables: unknown[]
  contentHash: string
  provenance: string
  warnings: string[]
  createdAt: string
}

export interface VisualizationAssetRecord {
  id: string
  visualizationId: string
  kind: "image" | "video" | "document" | "code" | "artifact"
  title: string
  description: string
  storageKey: string
  url: string | null
  contentType: string
  sizeBytes: number
  contentHash: string
  createdAt: string
}

export interface ReviewRequestRecord {
  id: string
  visualizationId: string
  versionId: string
  tokenHash: string
  title: string
  status: "open" | "approved" | "changes_requested"
  createdAt: string
}

export interface ReviewCommentRecord {
  id: string
  reviewRequestId: string
  authorName: string
  body: string
  anchor: ReviewAnchor
  status: "comment" | "resolved" | "suggestion"
  suggestedPatch: unknown | null
  parentCommentId: string | null
  createdAt: string
  appliedAt: string | null
}

export interface AnalyticsEventRecord {
  id: string
  visualizationId: string | null
  publicId: string
  versionId: string | null
  type:
    | "view"
    | "section_view"
    | "slide_view"
    | "course_module_view"
    | "course_lesson_view"
    | "course_lesson_complete"
    | "course_quiz_answer"
    | "course_interaction"
    | "report_block_view"
    | "report_tab_change"
    | "report_chart_interaction"
    | "cta_click"
    | "lead_submit"
    | "poll_vote"
    | "visualization_complete"
    | "session_end"
  nodeId: string | null
  nodeKind: string | null
  visitorId: string
  value: string | null
  durationMs: number | null
  createdAt: string
}

export interface LeadRecord {
  id: string
  visualizationId: string | null
  publicId: string
  versionId: string | null
  visitorId: string | null
  fields: Record<string, string>
  createdAt: string
}

export interface ExperimentRecord {
  id: string
  visualizationId: string
  name: string
  question: string
  status: ExperimentStatus
  fallbackVersionId: string
  createdAt: string
  updatedAt: string
}

export interface ExperimentVariantRecord {
  id: string
  experimentId: string
  label: string
  versionId: string
  weight: number
}

export interface WorkflowRunRecord {
  id: string
  visualizationId: string | null
  kind: string
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface IdempotentCommand {
  idempotencyKey: string
  actor?: ActorContext
}

export interface RegisterUserWithTeamCommand extends IdempotentCommand {
  userId?: string
  teamId?: string
  workspaceId?: string
  name: string
  email: string
  passwordHash: string
  teamName: string
}

export interface RegisterUserWithTeamResult {
  status: "created" | "already_exists"
  user: UserRecord
  team: TeamRecord
  workspace: WorkspaceRecord
  membership: MembershipRecord
}

export interface CreateVisualizationCommand extends IdempotentCommand {
  id?: string
  teamId: string
  workspaceId: string
  publicId: string
  kind: VisualizationKind
  slug: string
  title: string
  description: string
  document: VisualizationDocument
  createdBy: string
  themeMode?: "brand" | "remix"
}

export interface SaveVisualizationRevisionCommand extends IdempotentCommand {
  visualizationId: string
  expectedRevision: number
  document: VisualizationDocument
  title?: string
  description?: string
  status?: VisualizationStatus
}

export type SaveVisualizationRevisionResult =
  | { status: "saved"; visualization: VisualizationRecord }
  | { status: "conflict"; currentRevision: number; visualization: VisualizationRecord }

export interface PublishVisualizationVersionCommand extends IdempotentCommand {
  visualizationId: string
  expectedRevision: number
  versionId: string
  label: string
  artifactStorageKey: string
  artifactUrl: string
  artifactHash: string
  manifest: Record<string, unknown>
  createdBy: string
  passwordHash?: string | null
}

export type PublishVisualizationVersionResult =
  | { status: "published"; visualization: VisualizationRecord; version: VisualizationVersion }
  | { status: "conflict"; currentRevision: number; visualization: VisualizationRecord }

export interface RestoreCheckpointCommand extends IdempotentCommand {
  visualizationId: string
  checkpointId: string
  expectedRevision: number
}

export interface AppendReviewCommentCommand extends IdempotentCommand {
  reviewRequestId: string
  authorName: string
  body: string
  anchor: ReviewAnchor
  status?: "comment" | "resolved" | "suggestion"
  suggestedPatch?: unknown
  parentCommentId?: string | null
}

export interface ActivateExperimentCommand extends IdempotentCommand {
  experimentId: string
}

export interface RecordExperimentExposureCommand extends IdempotentCommand {
  experimentId: string
  visitorId: string
}

export interface RollbackPublishedVersionCommand extends IdempotentCommand {
  visualizationId: string
  versionId: string
  expectedRevision: number
}

export interface AcceptInviteCommand extends IdempotentCommand {
  tokenHash: string
  userId: string
}

export interface UserRepository {
  get(id: string): Promise<UserRecord | null>
  findByEmail(email: string): Promise<UserRecord | null>
}

export interface SessionRepository {
  create(session: SessionRecord): Promise<SessionRecord>
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  delete(tokenHash: string): Promise<void>
}

export interface TeamRepository {
  get(id: string): Promise<TeamRecord | null>
}

export interface MembershipRepository {
  listByUser(userId: string): Promise<MembershipRecord[]>
}

export interface WorkspaceRepository {
  get(id: string): Promise<WorkspaceRecord | null>
  listByTeam(teamId: string): Promise<WorkspaceRecord[]>
}

export interface VisualizationRepository {
  get(id: string): Promise<VisualizationRecord | null>
  listByWorkspace(workspaceId: string, cursor?: string | null, limit?: number): Promise<Page<VisualizationRecord>>
  create(command: CreateVisualizationCommand): Promise<VisualizationRecord>
}

export interface VisualizationVersionRepository {
  get(id: string): Promise<VisualizationVersion | null>
  listByVisualization(visualizationId: string): Promise<VisualizationVersion[]>
}

export interface VisualizationCheckpointRepository {
  create(input: Omit<VisualizationCheckpointRecord, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<VisualizationCheckpointRecord>
  listByVisualization(visualizationId: string): Promise<VisualizationCheckpointRecord[]>
}

export interface VisualizationSourceRepository {
  create(input: VisualizationSourceRecord): Promise<VisualizationSourceRecord>
  listByVisualization(visualizationId: string): Promise<VisualizationSourceRecord[]>
}

export interface VisualizationAssetRepository {
  create(input: VisualizationAssetRecord): Promise<VisualizationAssetRecord>
  listByVisualization(visualizationId: string): Promise<VisualizationAssetRecord[]>
}

export interface ReviewRepository {
  createRequest(input: ReviewRequestRecord): Promise<ReviewRequestRecord>
  getRequest(id: string): Promise<ReviewRequestRecord | null>
  appendComment(command: AppendReviewCommentCommand): Promise<ReviewCommentRecord>
  listComments(reviewRequestId: string): Promise<ReviewCommentRecord[]>
}

export interface AnalyticsRepository {
  recordBatch(events: AnalyticsEventRecord[]): Promise<void>
  listByVisualization(visualizationId: string): Promise<AnalyticsEventRecord[]>
}

export interface LeadRepository {
  create(input: LeadRecord): Promise<LeadRecord>
  listByVisualization(visualizationId: string): Promise<LeadRecord[]>
}

export interface ExperimentRepository {
  create(input: ExperimentRecord, variants: ExperimentVariantRecord[]): Promise<ExperimentRecord>
  get(id: string): Promise<(ExperimentRecord & { variants: ExperimentVariantRecord[] }) | null>
}

export interface WorkflowRunRepository {
  create(input: WorkflowRunRecord): Promise<WorkflowRunRecord>
  update(id: string, patch: Partial<Pick<WorkflowRunRecord, "status" | "output" | "error">>): Promise<WorkflowRunRecord>
  get(id: string): Promise<WorkflowRunRecord | null>
}

export interface AtomicDomainCommands {
  registerUserWithTeam(command: RegisterUserWithTeamCommand): Promise<RegisterUserWithTeamResult>
  acceptInvite(command: AcceptInviteCommand): Promise<{ status: "accepted" | "already_accepted"; invite: InviteRecord; membership: MembershipRecord }>
  saveVisualizationRevision(command: SaveVisualizationRevisionCommand): Promise<SaveVisualizationRevisionResult>
  publishVisualizationVersion(command: PublishVisualizationVersionCommand): Promise<PublishVisualizationVersionResult>
  restoreCheckpoint(command: RestoreCheckpointCommand): Promise<SaveVisualizationRevisionResult>
  appendReviewComment(command: AppendReviewCommentCommand): Promise<ReviewCommentRecord>
  activateExperiment(command: ActivateExperimentCommand): Promise<ExperimentRecord>
  recordExperimentExposure(command: RecordExperimentExposureCommand): Promise<{ variantId: string; versionId: string }>
  rollbackPublishedVersion(command: RollbackPublishedVersionCommand): Promise<PublishVisualizationVersionResult>
}

export interface PersistenceProvider {
  readonly kind: PersistenceKind
  readonly capabilities: PersistenceCapabilities

  health(): Promise<ProviderHealth>

  users: UserRepository
  sessions: SessionRepository
  teams: TeamRepository
  memberships: MembershipRepository
  invites: {
    getByTokenHash(tokenHash: string): Promise<InviteRecord | null>
  }
  workspaces: WorkspaceRepository
  visualizations: VisualizationRepository
  versions: VisualizationVersionRepository
  checkpoints: VisualizationCheckpointRepository
  sources: VisualizationSourceRepository
  assets: VisualizationAssetRepository
  reviews: ReviewRepository
  analytics: AnalyticsRepository
  leads: LeadRepository
  experiments: ExperimentRepository
  workflowRuns: WorkflowRunRepository

  commands: AtomicDomainCommands
}
