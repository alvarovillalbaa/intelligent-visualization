import { createDomainId } from "@/packages/domain/ids"
import { contentHash } from "@/packages/domain/serialization"
import { migrateVisualizationDocument } from "@/packages/domain/migrations"
import type {
  AnalyticsEventRecord,
  AppendReviewCommentCommand,
  CreateVisualizationCommand,
  ExperimentRecord,
  ExperimentVariantRecord,
  InviteRecord,
  LeadRecord,
  MembershipRecord,
  PersistenceProvider,
  PublishVisualizationVersionCommand,
  ReviewCommentRecord,
  ReviewRequestRecord,
  RollbackPublishedVersionCommand,
  SessionRecord,
  TeamRecord,
  UserRecord,
  VisualizationAssetRecord,
  VisualizationCheckpointRecord,
  VisualizationSourceRecord,
  WorkflowRunRecord,
  WorkspaceRecord,
} from "@/packages/backend-contracts/provider"
import type { VisualizationRecord, VisualizationVersion } from "@/packages/domain/entities"
import { createPostgresDatabase, getLocalDatabase, initializeLocalDatabase, type LocalDatabase } from "./database"
import { LOCAL_SCHEMA } from "./schema"
import { createWorkspaceDraftRepository } from "./workspace-drafts"
import { createWorkspacePublicationRepository } from "./workspace-publications"

type LocalRow = Record<string, unknown>
type LocalStatement = { sql: string; args: readonly unknown[] }

export interface LocalPersistenceOptions {
  connectionString?: string
}

export class LocalPersistenceProvider implements PersistenceProvider {
  readonly kind = "local" as const
  readonly capabilities = {
    transactions: true,
    atomicPublish: true,
    nativeRealtime: false,
    nativeFileStorage: false,
    fullTextSearch: false,
    serverSidePagination: true,
    compareAndSwap: true,
    batchWrites: true,
  }

  private readonly database: LocalDatabase

  workspacePublications: import("@/packages/backend-contracts/workspace-publications").WorkspacePublicationRepository = {
    get: (...args) => createWorkspacePublicationRepository(this.database, this).get(...args),
    prepare: (...args) => createWorkspacePublicationRepository(this.database, this).prepare(...args),
    commit: (...args) => createWorkspacePublicationRepository(this.database, this).commit(...args),
    resolve: (...args) => createWorkspacePublicationRepository(this.database, this).resolve(...args),
  }

  workspaceDrafts: import("@/packages/backend-contracts/workspace-drafts").WorkspaceDraftRepository = {
    list: (...args) => createWorkspaceDraftRepository(this.database, this).list(...args),
    get: (...args) => createWorkspaceDraftRepository(this.database, this).get(...args),
    save: (...args) => createWorkspaceDraftRepository(this.database, this).save(...args),
  }

  constructor(options: LocalPersistenceOptions = {}) {
    this.database = options.connectionString !== undefined ? createPostgresDatabase(options.connectionString) : getLocalDatabase()
  }

  async migrate() {
    await initializeLocalDatabase(this.database)
  }

  async close() {
    await this.database.close()
  }

  async health() {
    await this.migrate()
    const result = await this.execute(`SELECT 1 as ok`)
    return {
      ok: result.rows[0]?.ok === 1,
      message: "Local PostgreSQL provider is reachable.",
      checkedAt: now(),
      details: {
        provider: "local",
      },
    }
  }

  users = {
    get: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.users WHERE id = $1`, [id])
      return row ? mapUser(row) : null
    },
    findByEmail: async (email: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.users WHERE email = $1`, [email.toLowerCase()])
      return row ? mapUser(row) : null
    },
  }

  sessions = {
    create: async (session: SessionRecord) => {
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.sessions (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)`,
        args: [session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt],
      })
      return session
    },
    findByTokenHash: async (tokenHash: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.sessions WHERE token_hash = $1`, [tokenHash])
      return row ? mapSession(row) : null
    },
    delete: async (tokenHash: string) => {
      await this.execute({ sql: `DELETE FROM ${LOCAL_SCHEMA}.sessions WHERE token_hash = $1`, args: [tokenHash] })
    },
  }

  teams = {
    get: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.teams WHERE id = $1`, [id])
      return row ? mapTeam(row) : null
    },
  }

  memberships = {
    listByUser: async (userId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.team_memberships WHERE user_id = $1`, [userId])
      return rows.map(mapMembership)
    },
  }

  invites = {
    getByTokenHash: async (tokenHash: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.invites WHERE token_hash = $1`, [tokenHash])
      return row ? mapInvite(row) : null
    },
  }

  workspaces = {
    get: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.workspaces WHERE id = $1`, [id])
      return row ? mapWorkspace(row) : null
    },
    listByTeam: async (teamId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.workspaces WHERE team_id = $1 ORDER BY created_at ASC`, [teamId])
      return rows.map(mapWorkspace)
    },
  }

  visualizations = {
    get: async (id: string) => this.getVisualization(id),
    listByWorkspace: async (workspaceId: string, cursor: string | null = null, limit = 50) => {
      const cappedLimit = Math.min(Math.max(limit, 1), 100)
      const rows = await this.all(
        cursor
          ? `SELECT * FROM ${LOCAL_SCHEMA}.visualizations WHERE workspace_id = $1 AND updated_at < $2 ORDER BY updated_at DESC LIMIT $3`
          : `SELECT * FROM ${LOCAL_SCHEMA}.visualizations WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2`,
        cursor ? [workspaceId, cursor, cappedLimit + 1] : [workspaceId, cappedLimit + 1],
      )
      const items = rows.slice(0, cappedLimit).map(mapVisualization)
      return {
        items,
        nextCursor: rows.length > cappedLimit ? timestamp(rows[cappedLimit - 1].updated_at) : null,
      }
    },
    create: async (command: CreateVisualizationCommand) => this.withIdempotency("createVisualization", command.idempotencyKey, async () => {
      const createdAt = now()
      const document = migrateVisualizationDocument(command.document)
      const draftHash = contentHash(document)
      const id = command.id ?? createDomainId()
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.visualizations (id, team_id, workspace_id, public_id, kind, slug, title, description, status, schema_version, draft_document_json, draft_hash, draft_revision, theme_mode, created_by, created_at, updated_at, published_version_id, password_protected, password_hash)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NULL, FALSE, NULL)`,
        args: [
          id,
          command.teamId,
          command.workspaceId,
          command.publicId,
          command.kind,
          command.slug,
          command.title,
          command.description,
          "draft",
          document.schemaVersion,
          JSON.stringify(document),
          draftHash,
          1,
          command.themeMode ?? "brand",
          command.createdBy,
          createdAt,
          createdAt,
        ],
      })
      const visualization = await this.getVisualization(id)
      if (!visualization) throw new Error("Failed to create visualization.")
      return visualization
    }),
  }

  versions = {
    get: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_versions WHERE id = $1`, [id])
      return row ? mapVersion(row) : null
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_versions WHERE visualization_id = $1 ORDER BY created_at DESC`, [visualizationId])
      return rows.map(mapVersion)
    },
  }

  checkpoints = {
    create: async (input: Omit<VisualizationCheckpointRecord, "id" | "createdAt"> & { id?: string; createdAt?: string }) => {
      const record: VisualizationCheckpointRecord = {
        ...input,
        id: input.id ?? createDomainId(),
        createdAt: input.createdAt ?? now(),
      }
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.visualization_checkpoints (id, visualization_id, title, summary, prompt, revision, document_json, document_hash, created_by, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        args: [record.id, record.visualizationId, record.title, record.summary, record.prompt, record.revision, JSON.stringify(record.document), record.documentHash, record.createdBy, record.createdAt],
      })
      return record
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_checkpoints WHERE visualization_id = $1 ORDER BY created_at DESC`, [visualizationId])
      return rows.map(mapCheckpoint)
    },
  }

  sources = {
    create: async (input: VisualizationSourceRecord) => {
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.visualization_sources (id, visualization_id, filename_or_url, mime, size_bytes, storage_key, extraction_state, extracted_text, structured_tables_json, content_hash, provenance, warnings_json, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        args: [input.id, input.visualizationId, input.filenameOrUrl, input.mime, input.sizeBytes, input.storageKey, input.extractionState, input.extractedText, JSON.stringify(input.structuredTables), input.contentHash, input.provenance, JSON.stringify(input.warnings), input.createdAt],
      })
      return input
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_sources WHERE visualization_id = $1 ORDER BY created_at ASC`, [visualizationId])
      return rows.map(mapSource)
    },
  }

  assets = {
    create: async (input: VisualizationAssetRecord) => {
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.visualization_assets (id, visualization_id, kind, title, description, storage_key, url, content_type, size_bytes, content_hash, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        args: [input.id, input.visualizationId, input.kind, input.title, input.description, input.storageKey, input.url, input.contentType, input.sizeBytes, input.contentHash, input.createdAt],
      })
      return input
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_assets WHERE visualization_id = $1 ORDER BY created_at ASC`, [visualizationId])
      return rows.map(mapAsset)
    },
  }

  reviews = {
    createRequest: async (input: ReviewRequestRecord) => {
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.review_requests (id, visualization_id, version_id, token_hash, title, status, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        args: [input.id, input.visualizationId, input.versionId, input.tokenHash, input.title, input.status, input.createdAt],
      })
      return input
    },
    getRequest: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.review_requests WHERE id = $1`, [id])
      return row ? mapReviewRequest(row) : null
    },
    appendComment: async (command: AppendReviewCommentCommand) => this.commands.appendReviewComment(command),
    listComments: async (reviewRequestId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.review_comments WHERE review_request_id = $1 ORDER BY created_at ASC`, [reviewRequestId])
      return rows.map(mapReviewComment)
    },
  }

  analytics = {
    recordBatch: async (events: AnalyticsEventRecord[]) => {
      if (events.length === 0) return
      await this.batch(
        events.map((event) => ({
          sql: `INSERT INTO ${LOCAL_SCHEMA}.analytics_events (id, visualization_id, public_id, version_id, type, node_id, node_kind, visitor_id, value, duration_ms, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
          args: [event.id, event.visualizationId, event.publicId, event.versionId, event.type, event.nodeId, event.nodeKind, event.visitorId, event.value, event.durationMs, event.createdAt],
        })),
      )
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.analytics_events WHERE visualization_id = $1 ORDER BY created_at ASC`, [visualizationId])
      return rows.map(mapAnalyticsEvent)
    },
  }

  leads = {
    create: async (input: LeadRecord) => {
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.leads (id, visualization_id, public_id, version_id, visitor_id, fields_json, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        args: [input.id, input.visualizationId, input.publicId, input.versionId, input.visitorId, JSON.stringify(input.fields), input.createdAt],
      })
      return input
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.leads WHERE visualization_id = $1 ORDER BY created_at ASC`, [visualizationId])
      return rows.map(mapLead)
    },
  }

  experiments = {
    create: async (input: ExperimentRecord, variants: ExperimentVariantRecord[]) => {
      validateExperimentVariants(variants)
      const statements: LocalStatement[] = [
        {
          sql: `INSERT INTO ${LOCAL_SCHEMA}.experiments (id, visualization_id, name, question, status, fallback_version_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          args: [input.id, input.visualizationId, input.name, input.question, input.status, input.fallbackVersionId, input.createdAt, input.updatedAt],
        },
        ...variants.map((variant) => ({
          sql: `INSERT INTO ${LOCAL_SCHEMA}.experiment_variants (id, experiment_id, label, version_id, weight) VALUES ($1, $2, $3, $4, $5)`,
          args: [variant.id, variant.experimentId, variant.label, variant.versionId, variant.weight],
        })),
      ]
      await this.batch(statements)
      return input
    },
    get: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.experiments WHERE id = $1`, [id])
      if (!row) return null
      const variants = (await this.all(`SELECT * FROM ${LOCAL_SCHEMA}.experiment_variants WHERE experiment_id = $1 ORDER BY id ASC`, [id])).map(mapVariant)
      return { ...mapExperiment(row), variants }
    },
  }

  workflowRuns = {
    create: async (input: WorkflowRunRecord) => {
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.workflow_runs (id, visualization_id, kind, status, input_json, output_json, error, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        args: [input.id, input.visualizationId, input.kind, input.status, JSON.stringify(input.input), input.output ? JSON.stringify(input.output) : null, input.error, input.createdAt, input.updatedAt],
      })
      return input
    },
    update: async (id: string, patch: Partial<Pick<WorkflowRunRecord, "status" | "output" | "error">>) => {
      const existing = await this.workflowRuns.get(id)
      if (!existing) throw new Error("Workflow run not found.")
      const updated: WorkflowRunRecord = {
        ...existing,
        ...patch,
        updatedAt: now(),
      }
      await this.execute({
        sql: `UPDATE ${LOCAL_SCHEMA}.workflow_runs SET status = $1, output_json = $2, error = $3, updated_at = $4 WHERE id = $5`,
        args: [updated.status, updated.output ? JSON.stringify(updated.output) : null, updated.error, updated.updatedAt, id],
      })
      return updated
    },
    get: async (id: string) => {
      const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.workflow_runs WHERE id = $1`, [id])
      return row ? mapWorkflowRun(row) : null
    },
  }

  commands = {
    registerUserWithTeam: async (command: import("@/packages/backend-contracts/provider").RegisterUserWithTeamCommand) =>
      this.withIdempotency("registerUserWithTeam", command.idempotencyKey, async () => {
        await this.lockResource(`registration:${command.email.toLowerCase()}`)
        const existing = await this.users.findByEmail(command.email)
        if (existing) {
          const membership = (await this.memberships.listByUser(existing.id))[0]
          if (!membership) throw new Error("Existing user has no membership.")
          const team = await this.teams.get(membership.teamId)
          const workspace = (await this.workspaces.listByTeam(membership.teamId))[0]
          if (!team || !workspace) throw new Error("Existing user has no team workspace.")
          return { status: "already_exists" as const, user: existing, team, workspace, membership }
        }

        const createdAt = now()
        const user: UserRecord = {
          id: command.userId ?? createDomainId(),
          email: command.email.toLowerCase(),
          name: command.name,
          passwordHash: command.passwordHash,
          createdAt,
          updatedAt: createdAt,
        }
        const team: TeamRecord = {
          id: command.teamId ?? createDomainId(),
          slug: slugify(command.teamName),
          name: command.teamName,
          brand: {},
          createdAt,
          updatedAt: createdAt,
        }
        const workspace: WorkspaceRecord = {
          id: command.workspaceId ?? createDomainId(),
          teamId: team.id,
          slug: "hq",
          name: "HQ",
          description: "Default workspace",
          createdAt,
          updatedAt: createdAt,
        }
        const membership: MembershipRecord = {
          teamId: team.id,
          userId: user.id,
          role: "admin",
          createdAt,
        }

        await this.batch(
          [
            { sql: `INSERT INTO ${LOCAL_SCHEMA}.users (id, email, name, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`, args: [user.id, user.email, user.name, user.passwordHash, user.createdAt, user.updatedAt] },
            { sql: `INSERT INTO ${LOCAL_SCHEMA}.teams (id, slug, name, brand_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`, args: [team.id, team.slug, team.name, JSON.stringify(team.brand), team.createdAt, team.updatedAt] },
            { sql: `INSERT INTO ${LOCAL_SCHEMA}.workspaces (id, team_id, slug, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, args: [workspace.id, workspace.teamId, workspace.slug, workspace.name, workspace.description, workspace.createdAt, workspace.updatedAt] },
            { sql: `INSERT INTO ${LOCAL_SCHEMA}.team_memberships (team_id, user_id, role, created_at) VALUES ($1, $2, $3, $4)`, args: [membership.teamId, membership.userId, membership.role, membership.createdAt] },
          ],
        )

        return { status: "created" as const, user, team, workspace, membership }
      }),

    acceptInvite: async (command: import("@/packages/backend-contracts/provider").AcceptInviteCommand) =>
      this.withIdempotency("acceptInvite", command.idempotencyKey, async () => {
        const row = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.invites WHERE token_hash = $1 FOR UPDATE`, [command.tokenHash])
        const invite = row ? mapInvite(row) : null
        if (!invite) throw new Error("Invite not found.")
        const acceptedAt = invite.acceptedAt ?? now()
        const membership: MembershipRecord = {
          teamId: invite.teamId,
          userId: command.userId,
          role: invite.role,
          createdAt: acceptedAt,
        }
        if (invite.status === "accepted") {
          return { status: "already_accepted" as const, invite, membership }
        }
        await this.batch(
          [
            { sql: `UPDATE ${LOCAL_SCHEMA}.invites SET status = 'accepted', accepted_at = $1 WHERE id = $2`, args: [acceptedAt, invite.id] },
            { sql: `INSERT INTO ${LOCAL_SCHEMA}.team_memberships (team_id, user_id, role, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (team_id, user_id) DO NOTHING`, args: [membership.teamId, membership.userId, membership.role, membership.createdAt] },
          ],
        )
        return {
          status: "accepted" as const,
          invite: { ...invite, status: "accepted" as const, acceptedAt },
          membership,
        }
      }),

    saveVisualizationRevision: async (command: import("@/packages/backend-contracts/provider").SaveVisualizationRevisionCommand) =>
      this.withIdempotency("saveVisualizationRevision", command.idempotencyKey, async () => {
        const current = await this.getVisualization(command.visualizationId, true)
        if (!current) throw new Error("Visualization not found.")
        if (current.draftRevision !== command.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.draftRevision, visualization: current }
        }
        const document = migrateVisualizationDocument(command.document)
        const updatedAt = now()
        await this.execute({
          sql: `UPDATE ${LOCAL_SCHEMA}.visualizations SET title = $1, description = $2, status = $3, schema_version = $4, draft_document_json = $5, draft_hash = $6, draft_revision = $7, updated_at = $8 WHERE id = $9`,
          args: [
            command.title ?? document.title,
            command.description ?? document.summary,
            command.status ?? current.status,
            document.schemaVersion,
            JSON.stringify(document),
            contentHash(document),
            current.draftRevision + 1,
            updatedAt,
            current.id,
          ],
        })
        const visualization = await this.getVisualization(current.id)
        if (!visualization) throw new Error("Visualization not found after save.")
        return { status: "saved" as const, visualization }
      }),

    publishVisualizationVersion: async (command: PublishVisualizationVersionCommand) =>
      this.withIdempotency("publishVisualizationVersion", command.idempotencyKey, async () => {
        const current = await this.getVisualization(command.visualizationId, true)
        if (!current) throw new Error("Visualization not found.")
        if (current.draftRevision !== command.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.draftRevision, visualization: current }
        }
        const createdAt = now()
        const version: VisualizationVersion = {
          id: command.versionId,
          visualizationId: current.id,
          label: command.label,
          status: "published",
          schemaVersion: current.draftDocument.schemaVersion,
          document: current.draftDocument,
          documentHash: current.draftHash,
          artifactStorageKey: command.artifactStorageKey,
          artifactUrl: command.artifactUrl,
          artifactHash: command.artifactHash,
          manifest: command.manifest,
          createdBy: command.createdBy,
          createdAt,
          passwordHash: command.passwordHash ?? null,
        }
        await this.batch(
          [
            {
              sql: `INSERT INTO ${LOCAL_SCHEMA}.visualization_versions (id, visualization_id, label, status, schema_version, document_json, document_hash, artifact_storage_key, artifact_url, artifact_hash, manifest_json, created_by, created_at, password_hash)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              args: [version.id, version.visualizationId, version.label, version.status, version.schemaVersion, JSON.stringify(version.document), version.documentHash, version.artifactStorageKey, version.artifactUrl, version.artifactHash, JSON.stringify(version.manifest), version.createdBy, version.createdAt, version.passwordHash],
            },
            { sql: `UPDATE ${LOCAL_SCHEMA}.visualizations SET status = 'published', published_version_id = $1, updated_at = $2, password_protected = $4, password_hash = $5 WHERE id = $3`, args: [version.id, createdAt, current.id, Boolean(version.passwordHash), version.passwordHash] },
          ],
        )
        const visualization = await this.getVisualization(current.id)
        if (!visualization) throw new Error("Visualization not found after publish.")
        return { status: "published" as const, visualization, version }
      }),

    restoreCheckpoint: async (command: import("@/packages/backend-contracts/provider").RestoreCheckpointCommand) =>
      this.withIdempotency("restoreCheckpoint", command.idempotencyKey, async () => {
        const checkpoint = (await this.checkpoints.listByVisualization(command.visualizationId)).find((item) => item.id === command.checkpointId)
        if (!checkpoint) throw new Error("Checkpoint not found.")
        return this.commands.saveVisualizationRevision({
          idempotencyKey: `${command.idempotencyKey}:save`,
          actor: command.actor,
          visualizationId: command.visualizationId,
          expectedRevision: command.expectedRevision,
          document: checkpoint.document,
          title: checkpoint.title,
          description: checkpoint.summary,
        })
      }),

    appendReviewComment: async (command: AppendReviewCommentCommand) =>
      this.withIdempotency("appendReviewComment", command.idempotencyKey, async () => {
        const createdAt = now()
        const comment: ReviewCommentRecord = {
          id: createDomainId(),
          reviewRequestId: command.reviewRequestId,
          authorName: command.authorName,
          body: command.body,
          anchor: command.anchor,
          status: command.status ?? "comment",
          suggestedPatch: command.suggestedPatch ?? null,
          parentCommentId: command.parentCommentId ?? null,
          createdAt,
          appliedAt: null,
        }
        await this.execute({
          sql: `INSERT INTO ${LOCAL_SCHEMA}.review_comments (id, review_request_id, author_name, body, anchor_json, status, suggested_patch_json, parent_comment_id, created_at, applied_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          args: [comment.id, comment.reviewRequestId, comment.authorName, comment.body, JSON.stringify(comment.anchor), comment.status, comment.suggestedPatch == null ? null : JSON.stringify(comment.suggestedPatch), comment.parentCommentId, comment.createdAt, comment.appliedAt],
        })
        return comment
      }),

    activateExperiment: async (command: import("@/packages/backend-contracts/provider").ActivateExperimentCommand) =>
      this.withIdempotency("activateExperiment", command.idempotencyKey, async () => {
        await this.one(`SELECT id FROM ${LOCAL_SCHEMA}.experiments WHERE id = $1 FOR UPDATE`, [command.experimentId])
        const experiment = await this.experiments.get(command.experimentId)
        if (!experiment) throw new Error("Experiment not found.")
        validateExperimentVariants(experiment.variants)
        const updatedAt = now()
        await this.execute({
          sql: `UPDATE ${LOCAL_SCHEMA}.experiments SET status = 'running', updated_at = $1 WHERE id = $2`,
          args: [updatedAt, experiment.id],
        })
        return { ...experiment, status: "running" as const, updatedAt }
      }),

    recordExperimentExposure: async (command: import("@/packages/backend-contracts/provider").RecordExperimentExposureCommand) =>
      this.withIdempotency("recordExperimentExposure", command.idempotencyKey, async () => {
        await this.one(`SELECT id FROM ${LOCAL_SCHEMA}.experiments WHERE id = $1 FOR UPDATE`, [command.experimentId])
        const existing = await this.one(`SELECT * FROM ${LOCAL_SCHEMA}.experiment_exposures WHERE experiment_id = $1 AND visitor_id = $2`, [command.experimentId, command.visitorId])
        if (existing) {
          return { variantId: String(existing.variant_id), versionId: String(existing.version_id) }
        }
        const experiment = await this.experiments.get(command.experimentId)
        if (!experiment) throw new Error("Experiment not found.")
        if (experiment.status !== "running") throw new Error("Experiment is not running.")
        const variant = chooseVariant(experiment.variants, command.visitorId)
        await this.execute({
          sql: `INSERT INTO ${LOCAL_SCHEMA}.experiment_exposures (id, experiment_id, visitor_id, variant_id, version_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          args: [createDomainId(), command.experimentId, command.visitorId, variant.id, variant.versionId, now()],
        })
        return { variantId: variant.id, versionId: variant.versionId }
      }),

    rollbackPublishedVersion: async (command: RollbackPublishedVersionCommand) =>
      this.withIdempotency("rollbackPublishedVersion", command.idempotencyKey, async () => {
        const current = await this.getVisualization(command.visualizationId, true)
        if (!current) throw new Error("Visualization not found.")
        if (current.draftRevision !== command.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.draftRevision, visualization: current }
        }
        const version = await this.versions.get(command.versionId)
        if (!version || version.visualizationId !== current.id) throw new Error("Version not found.")
        const updatedAt = now()
        await this.execute({
          sql: `UPDATE ${LOCAL_SCHEMA}.visualizations SET published_version_id = $1, updated_at = $2, password_protected = $4, password_hash = $5 WHERE id = $3`,
          args: [version.id, updatedAt, current.id, Boolean(version.passwordHash), version.passwordHash],
        })
        const visualization = await this.getVisualization(current.id)
        if (!visualization) throw new Error("Visualization not found after rollback.")
        return { status: "published" as const, visualization, version }
      }),
  }

  private async getVisualization(id: string, forUpdate = false): Promise<VisualizationRecord | null> {
    const row = await this.one(
      forUpdate
        ? `SELECT * FROM ${LOCAL_SCHEMA}.visualizations WHERE id = $1 FOR UPDATE`
        : `SELECT * FROM ${LOCAL_SCHEMA}.visualizations WHERE id = $1`,
      [id],
    )
    return row ? mapVisualization(row) : null
  }

  private async withIdempotency<T>(command: string, key: string, work: () => Promise<T>): Promise<T> {
    await this.migrate()
    return this.database.transaction(async () => {
      // Lock before reading: concurrent requests with the same key observe one committed result.
      await this.lockResource(`idempotency:${key}`)
      const existing = await this.one(`SELECT command, result_json FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1`, [key])
      if (existing) {
        if (existing.command !== command) throw new Error("Idempotency key was already used for another command.")
        return existing.result_json as T
      }
      const result = await work()
      await this.execute({
        sql: `INSERT INTO ${LOCAL_SCHEMA}.idempotency_records (key, command, result_json, created_at) VALUES ($1, $2, $3, $4)`,
        args: [key, command, JSON.stringify(result), now()],
      })
      return result
    })
  }

  private async lockResource(key: string) {
    await this.database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${LOCAL_SCHEMA}:${key}`])
  }

  private async execute(statement: LocalStatement | string) {
    await this.migrate()
    return typeof statement === "string"
      ? this.database.query(statement)
      : this.database.query(statement.sql, statement.args)
  }

  private async batch(statements: LocalStatement[]) {
    await this.migrate()
    await this.database.transaction(async (transaction) => {
      for (const statement of statements) await transaction.query(statement.sql, statement.args)
    })
  }

  private async one(sql: string, args: readonly unknown[] = []): Promise<LocalRow | null> {
    await this.migrate()
    const result = await this.execute({ sql, args })
    return result.rows[0] ?? null
  }

  private async all(sql: string, args: readonly unknown[] = []): Promise<LocalRow[]> {
    await this.migrate()
    const result = await this.execute({ sql, args })
    return result.rows
  }
}

export function createLocalPersistenceProvider(options?: LocalPersistenceOptions) {
  return new LocalPersistenceProvider(options)
}

function now() {
  return new Date().toISOString()
}

function timestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function json<T>(value: unknown, fallback: T): T {
  // pg decodes JSONB, including scalar strings and false, before returning a row.
  return value == null ? fallback : value as T
}

function mapUser(row: LocalRow): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }
}

function mapSession(row: LocalRow): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: timestamp(row.expires_at),
    createdAt: timestamp(row.created_at),
  }
}

function mapTeam(row: LocalRow): TeamRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    brand: json<Record<string, unknown>>(row.brand_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }
}

function mapMembership(row: LocalRow): MembershipRecord {
  return {
    teamId: String(row.team_id),
    userId: String(row.user_id),
    role: String(row.role) as MembershipRecord["role"],
    createdAt: timestamp(row.created_at),
  }
}

function mapInvite(row: LocalRow): InviteRecord {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    workspaceId: String(row.workspace_id),
    email: String(row.email),
    invitedName: String(row.invited_name),
    role: String(row.role) as InviteRecord["role"],
    tokenHash: String(row.token_hash),
    status: String(row.status) as InviteRecord["status"],
    invitedByUserId: String(row.invited_by_user_id),
    createdAt: timestamp(row.created_at),
    acceptedAt: row.accepted_at ? timestamp(row.accepted_at) : null,
  }
}

function mapWorkspace(row: LocalRow): WorkspaceRecord {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }
}

function mapVisualization(row: LocalRow): VisualizationRecord {
  const document = migrateVisualizationDocument(json(row.draft_document_json, {}))
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    workspaceId: String(row.workspace_id),
    publicId: String(row.public_id),
    kind: String(row.kind) as VisualizationRecord["kind"],
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description),
    status: String(row.status) as VisualizationRecord["status"],
    schemaVersion: Number(row.schema_version),
    draftDocument: document,
    draftHash: String(row.draft_hash),
    draftRevision: Number(row.draft_revision),
    themeMode: String(row.theme_mode) as VisualizationRecord["themeMode"],
    createdBy: String(row.created_by),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    publishedVersionId: row.published_version_id ? String(row.published_version_id) : null,
    passwordProtected: Boolean(row.password_protected),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
  }
}

function mapVersion(row: LocalRow): VisualizationVersion {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    label: String(row.label),
    status: String(row.status) as VisualizationVersion["status"],
    schemaVersion: Number(row.schema_version),
    document: migrateVisualizationDocument(json(row.document_json, {})),
    documentHash: String(row.document_hash),
    artifactStorageKey: row.artifact_storage_key ? String(row.artifact_storage_key) : null,
    artifactUrl: row.artifact_url ? String(row.artifact_url) : null,
    artifactHash: row.artifact_hash ? String(row.artifact_hash) : null,
    manifest: json<Record<string, unknown>>(row.manifest_json, {}),
    createdBy: String(row.created_by),
    createdAt: timestamp(row.created_at),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
  }
}

function mapCheckpoint(row: LocalRow): VisualizationCheckpointRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    title: String(row.title),
    summary: String(row.summary),
    prompt: String(row.prompt),
    revision: Number(row.revision),
    document: migrateVisualizationDocument(json(row.document_json, {})),
    documentHash: String(row.document_hash),
    createdBy: String(row.created_by),
    createdAt: timestamp(row.created_at),
  }
}

function mapSource(row: LocalRow): VisualizationSourceRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    filenameOrUrl: String(row.filename_or_url),
    mime: String(row.mime),
    sizeBytes: Number(row.size_bytes),
    storageKey: String(row.storage_key),
    extractionState: String(row.extraction_state) as VisualizationSourceRecord["extractionState"],
    extractedText: row.extracted_text ? String(row.extracted_text) : null,
    structuredTables: json<unknown[]>(row.structured_tables_json, []),
    contentHash: String(row.content_hash),
    provenance: String(row.provenance),
    warnings: json<string[]>(row.warnings_json, []),
    createdAt: timestamp(row.created_at),
  }
}

function mapAsset(row: LocalRow): VisualizationAssetRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    kind: String(row.kind) as VisualizationAssetRecord["kind"],
    title: String(row.title),
    description: String(row.description),
    storageKey: String(row.storage_key),
    url: row.url ? String(row.url) : null,
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    contentHash: String(row.content_hash),
    createdAt: timestamp(row.created_at),
  }
}

function mapReviewRequest(row: LocalRow): ReviewRequestRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    versionId: String(row.version_id),
    tokenHash: String(row.token_hash),
    title: String(row.title),
    status: String(row.status) as ReviewRequestRecord["status"],
    createdAt: timestamp(row.created_at),
  }
}

function mapReviewComment(row: LocalRow): ReviewCommentRecord {
  return {
    id: String(row.id),
    reviewRequestId: String(row.review_request_id),
    authorName: String(row.author_name),
    body: String(row.body),
    anchor: json(row.anchor_json, { nodeKind: "visualization", nodeId: "" }),
    status: String(row.status) as ReviewCommentRecord["status"],
    suggestedPatch: json(row.suggested_patch_json, null),
    parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null,
    createdAt: timestamp(row.created_at),
    appliedAt: row.applied_at ? timestamp(row.applied_at) : null,
  }
}

function mapAnalyticsEvent(row: LocalRow): AnalyticsEventRecord {
  return {
    id: String(row.id),
    visualizationId: row.visualization_id ? String(row.visualization_id) : null,
    publicId: String(row.public_id),
    versionId: row.version_id ? String(row.version_id) : null,
    type: String(row.type) as AnalyticsEventRecord["type"],
    nodeId: row.node_id ? String(row.node_id) : null,
    nodeKind: row.node_kind ? String(row.node_kind) : null,
    visitorId: String(row.visitor_id),
    value: row.value ? String(row.value) : null,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    createdAt: timestamp(row.created_at),
  }
}

function mapLead(row: LocalRow): LeadRecord {
  return {
    id: String(row.id),
    visualizationId: row.visualization_id ? String(row.visualization_id) : null,
    publicId: String(row.public_id),
    versionId: row.version_id ? String(row.version_id) : null,
    visitorId: row.visitor_id ? String(row.visitor_id) : null,
    fields: json<Record<string, string>>(row.fields_json, {}),
    createdAt: timestamp(row.created_at),
  }
}

function mapExperiment(row: LocalRow): ExperimentRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    name: String(row.name),
    question: String(row.question),
    status: String(row.status) as ExperimentRecord["status"],
    fallbackVersionId: String(row.fallback_version_id),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }
}

function mapVariant(row: LocalRow): ExperimentVariantRecord {
  return {
    id: String(row.id),
    experimentId: String(row.experiment_id),
    label: String(row.label),
    versionId: String(row.version_id),
    weight: Number(row.weight),
  }
}

function mapWorkflowRun(row: LocalRow): WorkflowRunRecord {
  return {
    id: String(row.id),
    visualizationId: row.visualization_id ? String(row.visualization_id) : null,
    kind: String(row.kind),
    status: String(row.status) as WorkflowRunRecord["status"],
    input: json<Record<string, unknown>>(row.input_json, {}),
    output: row.output_json ? json<Record<string, unknown>>(row.output_json, {}) : null,
    error: row.error ? String(row.error) : null,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }
}

function validateExperimentVariants(variants: ExperimentVariantRecord[]) {
  const weightTotal = variants.reduce((sum, variant) => sum + variant.weight, 0)
  if (weightTotal !== 100) {
    throw new Error("Experiment weights must total 100.")
  }
  const versionIds = new Set(variants.map((variant) => variant.versionId))
  if (versionIds.size !== variants.length) {
    throw new Error("Experiment variants must target unique versions.")
  }
}

function chooseVariant(variants: ExperimentVariantRecord[], visitorId: string) {
  validateExperimentVariants(variants)
  const bucket = stableBucket(visitorId)
  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.weight
    if (bucket < cumulative) {
      return variant
    }
  }
  return variants[variants.length - 1]
}

function stableBucket(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100
  }
  return hash
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "workspace"
}
