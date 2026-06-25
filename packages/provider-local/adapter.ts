import { createClient, type Client, type InArgs, type InStatement, type Row } from "@libsql/client"

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
import { localMigrations } from "./schema"

const DEFAULT_DATABASE_PATH = ".data/intelligent-visualization.sqlite"

export interface LocalPersistenceOptions {
  databasePath?: string
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

  private readonly client: Client

  constructor(options: LocalPersistenceOptions = {}) {
    this.client = createClient({
      url: `file:${options.databasePath ?? process.env.LOCAL_DATABASE_PATH ?? DEFAULT_DATABASE_PATH}`,
    })
  }

  async migrate() {
    await this.client.execute("PRAGMA foreign_keys = ON")
    await this.client.execute(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    )
    for (const migration of localMigrations) {
      const applied = await this.client.execute({
        sql: "SELECT version FROM schema_migrations WHERE version = ?",
        args: [migration.version],
      })
      if (applied.rows.length > 0) continue
      const statements: InStatement[] = migration.statements.map((sql) => ({ sql, args: [] }))
      statements.push({
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        args: [migration.version, migration.name, now()],
      })
      await this.client.batch(statements, "write")
    }
  }

  async health() {
    await this.migrate()
    const result = await this.client.execute("SELECT 1 as ok")
    return {
      ok: result.rows[0]?.ok === 1,
      message: "Local SQLite provider is reachable.",
      checkedAt: now(),
      details: {
        provider: "local",
      },
    }
  }

  users = {
    get: async (id: string) => {
      const row = await this.one("SELECT * FROM users WHERE id = ?", [id])
      return row ? mapUser(row) : null
    },
    findByEmail: async (email: string) => {
      const row = await this.one("SELECT * FROM users WHERE email = ?", [email.toLowerCase()])
      return row ? mapUser(row) : null
    },
  }

  sessions = {
    create: async (session: SessionRecord) => {
      await this.client.execute({
        sql: "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [session.id, session.userId, session.tokenHash, session.expiresAt, session.createdAt],
      })
      return session
    },
    findByTokenHash: async (tokenHash: string) => {
      const row = await this.one("SELECT * FROM sessions WHERE token_hash = ?", [tokenHash])
      return row ? mapSession(row) : null
    },
    delete: async (tokenHash: string) => {
      await this.client.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [tokenHash] })
    },
  }

  teams = {
    get: async (id: string) => {
      const row = await this.one("SELECT * FROM teams WHERE id = ?", [id])
      return row ? mapTeam(row) : null
    },
  }

  memberships = {
    listByUser: async (userId: string) => {
      const rows = await this.all("SELECT * FROM team_memberships WHERE user_id = ?", [userId])
      return rows.map(mapMembership)
    },
  }

  invites = {
    getByTokenHash: async (tokenHash: string) => {
      const row = await this.one("SELECT * FROM invites WHERE token_hash = ?", [tokenHash])
      return row ? mapInvite(row) : null
    },
  }

  workspaces = {
    get: async (id: string) => {
      const row = await this.one("SELECT * FROM workspaces WHERE id = ?", [id])
      return row ? mapWorkspace(row) : null
    },
    listByTeam: async (teamId: string) => {
      const rows = await this.all("SELECT * FROM workspaces WHERE team_id = ? ORDER BY created_at ASC", [teamId])
      return rows.map(mapWorkspace)
    },
  }

  visualizations = {
    get: async (id: string) => this.getVisualization(id),
    listByWorkspace: async (workspaceId: string, cursor: string | null = null, limit = 50) => {
      const cappedLimit = Math.min(Math.max(limit, 1), 100)
      const rows = await this.all(
        cursor
          ? "SELECT * FROM visualizations WHERE workspace_id = ? AND updated_at < ? ORDER BY updated_at DESC LIMIT ?"
          : "SELECT * FROM visualizations WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?",
        cursor ? [workspaceId, cursor, cappedLimit + 1] : [workspaceId, cappedLimit + 1],
      )
      const items = rows.slice(0, cappedLimit).map(mapVisualization)
      return {
        items,
        nextCursor: rows.length > cappedLimit ? String(rows[cappedLimit].updated_at) : null,
      }
    },
    create: async (command: CreateVisualizationCommand) => this.withIdempotency("createVisualization", command.idempotencyKey, async () => {
      const createdAt = now()
      const document = migrateVisualizationDocument(command.document)
      const draftHash = contentHash(document)
      const id = command.id ?? createDomainId()
      await this.client.execute({
        sql: `INSERT INTO visualizations (id, team_id, workspace_id, public_id, kind, slug, title, description, status, schema_version, draft_document_json, draft_hash, draft_revision, theme_mode, created_by, created_at, updated_at, published_version_id, password_protected, password_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)`,
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
      const row = await this.one("SELECT * FROM visualization_versions WHERE id = ?", [id])
      return row ? mapVersion(row) : null
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all("SELECT * FROM visualization_versions WHERE visualization_id = ? ORDER BY created_at DESC", [visualizationId])
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
      await this.client.execute({
        sql: `INSERT INTO visualization_checkpoints (id, visualization_id, title, summary, prompt, revision, document_json, document_hash, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [record.id, record.visualizationId, record.title, record.summary, record.prompt, record.revision, JSON.stringify(record.document), record.documentHash, record.createdBy, record.createdAt],
      })
      return record
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all("SELECT * FROM visualization_checkpoints WHERE visualization_id = ? ORDER BY created_at DESC", [visualizationId])
      return rows.map(mapCheckpoint)
    },
  }

  sources = {
    create: async (input: VisualizationSourceRecord) => {
      await this.client.execute({
        sql: `INSERT INTO visualization_sources (id, visualization_id, filename_or_url, mime, size_bytes, storage_key, extraction_state, extracted_text, structured_tables_json, content_hash, provenance, warnings_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [input.id, input.visualizationId, input.filenameOrUrl, input.mime, input.sizeBytes, input.storageKey, input.extractionState, input.extractedText, JSON.stringify(input.structuredTables), input.contentHash, input.provenance, JSON.stringify(input.warnings), input.createdAt],
      })
      return input
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all("SELECT * FROM visualization_sources WHERE visualization_id = ? ORDER BY created_at ASC", [visualizationId])
      return rows.map(mapSource)
    },
  }

  assets = {
    create: async (input: VisualizationAssetRecord) => {
      await this.client.execute({
        sql: `INSERT INTO visualization_assets (id, visualization_id, kind, title, description, storage_key, url, content_type, size_bytes, content_hash, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [input.id, input.visualizationId, input.kind, input.title, input.description, input.storageKey, input.url, input.contentType, input.sizeBytes, input.contentHash, input.createdAt],
      })
      return input
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all("SELECT * FROM visualization_assets WHERE visualization_id = ? ORDER BY created_at ASC", [visualizationId])
      return rows.map(mapAsset)
    },
  }

  reviews = {
    createRequest: async (input: ReviewRequestRecord) => {
      await this.client.execute({
        sql: `INSERT INTO review_requests (id, visualization_id, version_id, token_hash, title, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [input.id, input.visualizationId, input.versionId, input.tokenHash, input.title, input.status, input.createdAt],
      })
      return input
    },
    getRequest: async (id: string) => {
      const row = await this.one("SELECT * FROM review_requests WHERE id = ?", [id])
      return row ? mapReviewRequest(row) : null
    },
    appendComment: async (command: AppendReviewCommentCommand) => this.commands.appendReviewComment(command),
    listComments: async (reviewRequestId: string) => {
      const rows = await this.all("SELECT * FROM review_comments WHERE review_request_id = ? ORDER BY created_at ASC", [reviewRequestId])
      return rows.map(mapReviewComment)
    },
  }

  analytics = {
    recordBatch: async (events: AnalyticsEventRecord[]) => {
      if (events.length === 0) return
      await this.client.batch(
        events.map((event) => ({
          sql: `INSERT OR IGNORE INTO analytics_events (id, visualization_id, public_id, version_id, type, node_id, node_kind, visitor_id, value, duration_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [event.id, event.visualizationId, event.publicId, event.versionId, event.type, event.nodeId, event.nodeKind, event.visitorId, event.value, event.durationMs, event.createdAt],
        })),
        "write",
      )
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all("SELECT * FROM analytics_events WHERE visualization_id = ? ORDER BY created_at ASC", [visualizationId])
      return rows.map(mapAnalyticsEvent)
    },
  }

  leads = {
    create: async (input: LeadRecord) => {
      await this.client.execute({
        sql: "INSERT INTO leads (id, visualization_id, public_id, version_id, visitor_id, fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [input.id, input.visualizationId, input.publicId, input.versionId, input.visitorId, JSON.stringify(input.fields), input.createdAt],
      })
      return input
    },
    listByVisualization: async (visualizationId: string) => {
      const rows = await this.all("SELECT * FROM leads WHERE visualization_id = ? ORDER BY created_at ASC", [visualizationId])
      return rows.map(mapLead)
    },
  }

  experiments = {
    create: async (input: ExperimentRecord, variants: ExperimentVariantRecord[]) => {
      validateExperimentVariants(variants)
      const statements: InStatement[] = [
        {
          sql: "INSERT INTO experiments (id, visualization_id, name, question, status, fallback_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [input.id, input.visualizationId, input.name, input.question, input.status, input.fallbackVersionId, input.createdAt, input.updatedAt],
        },
        ...variants.map((variant) => ({
          sql: "INSERT INTO experiment_variants (id, experiment_id, label, version_id, weight) VALUES (?, ?, ?, ?, ?)",
          args: [variant.id, variant.experimentId, variant.label, variant.versionId, variant.weight],
        })),
      ]
      await this.client.batch(statements, "write")
      return input
    },
    get: async (id: string) => {
      const row = await this.one("SELECT * FROM experiments WHERE id = ?", [id])
      if (!row) return null
      const variants = (await this.all("SELECT * FROM experiment_variants WHERE experiment_id = ? ORDER BY id ASC", [id])).map(mapVariant)
      return { ...mapExperiment(row), variants }
    },
  }

  workflowRuns = {
    create: async (input: WorkflowRunRecord) => {
      await this.client.execute({
        sql: "INSERT INTO workflow_runs (id, visualization_id, kind, status, input_json, output_json, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      await this.client.execute({
        sql: "UPDATE workflow_runs SET status = ?, output_json = ?, error = ?, updated_at = ? WHERE id = ?",
        args: [updated.status, updated.output ? JSON.stringify(updated.output) : null, updated.error, updated.updatedAt, id],
      })
      return updated
    },
    get: async (id: string) => {
      const row = await this.one("SELECT * FROM workflow_runs WHERE id = ?", [id])
      return row ? mapWorkflowRun(row) : null
    },
  }

  commands = {
    registerUserWithTeam: async (command: import("@/packages/backend-contracts/provider").RegisterUserWithTeamCommand) =>
      this.withIdempotency("registerUserWithTeam", command.idempotencyKey, async () => {
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

        await this.client.batch(
          [
            { sql: "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", args: [user.id, user.email, user.name, user.passwordHash, user.createdAt, user.updatedAt] },
            { sql: "INSERT INTO teams (id, slug, name, brand_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", args: [team.id, team.slug, team.name, JSON.stringify(team.brand), team.createdAt, team.updatedAt] },
            { sql: "INSERT INTO workspaces (id, team_id, slug, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [workspace.id, workspace.teamId, workspace.slug, workspace.name, workspace.description, workspace.createdAt, workspace.updatedAt] },
            { sql: "INSERT INTO team_memberships (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", args: [membership.teamId, membership.userId, membership.role, membership.createdAt] },
          ],
          "write",
        )

        return { status: "created" as const, user, team, workspace, membership }
      }),

    acceptInvite: async (command: import("@/packages/backend-contracts/provider").AcceptInviteCommand) =>
      this.withIdempotency("acceptInvite", command.idempotencyKey, async () => {
        const invite = await this.invites.getByTokenHash(command.tokenHash)
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
        await this.client.batch(
          [
            { sql: "UPDATE invites SET status = 'accepted', accepted_at = ? WHERE id = ?", args: [acceptedAt, invite.id] },
            { sql: "INSERT OR IGNORE INTO team_memberships (team_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", args: [membership.teamId, membership.userId, membership.role, membership.createdAt] },
          ],
          "write",
        )
        return {
          status: "accepted" as const,
          invite: { ...invite, status: "accepted" as const, acceptedAt },
          membership,
        }
      }),

    saveVisualizationRevision: async (command: import("@/packages/backend-contracts/provider").SaveVisualizationRevisionCommand) =>
      this.withIdempotency("saveVisualizationRevision", command.idempotencyKey, async () => {
        const current = await this.getVisualization(command.visualizationId)
        if (!current) throw new Error("Visualization not found.")
        if (current.draftRevision !== command.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.draftRevision, visualization: current }
        }
        const document = migrateVisualizationDocument(command.document)
        const updatedAt = now()
        await this.client.execute({
          sql: "UPDATE visualizations SET title = ?, description = ?, status = ?, schema_version = ?, draft_document_json = ?, draft_hash = ?, draft_revision = ?, updated_at = ? WHERE id = ?",
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
        const current = await this.getVisualization(command.visualizationId)
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
        await this.client.batch(
          [
            {
              sql: `INSERT INTO visualization_versions (id, visualization_id, label, status, schema_version, document_json, document_hash, artifact_storage_key, artifact_url, artifact_hash, manifest_json, created_by, created_at, password_hash)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [version.id, version.visualizationId, version.label, version.status, version.schemaVersion, JSON.stringify(version.document), version.documentHash, version.artifactStorageKey, version.artifactUrl, version.artifactHash, JSON.stringify(version.manifest), version.createdBy, version.createdAt, version.passwordHash],
            },
            { sql: "UPDATE visualizations SET status = 'published', published_version_id = ?, updated_at = ? WHERE id = ?", args: [version.id, createdAt, current.id] },
          ],
          "write",
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
        await this.client.execute({
          sql: `INSERT INTO review_comments (id, review_request_id, author_name, body, anchor_json, status, suggested_patch_json, parent_comment_id, created_at, applied_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [comment.id, comment.reviewRequestId, comment.authorName, comment.body, JSON.stringify(comment.anchor), comment.status, comment.suggestedPatch ? JSON.stringify(comment.suggestedPatch) : null, comment.parentCommentId, comment.createdAt, comment.appliedAt],
        })
        return comment
      }),

    activateExperiment: async (command: import("@/packages/backend-contracts/provider").ActivateExperimentCommand) =>
      this.withIdempotency("activateExperiment", command.idempotencyKey, async () => {
        const experiment = await this.experiments.get(command.experimentId)
        if (!experiment) throw new Error("Experiment not found.")
        validateExperimentVariants(experiment.variants)
        await this.client.execute({
          sql: "UPDATE experiments SET status = 'running', updated_at = ? WHERE id = ?",
          args: [now(), experiment.id],
        })
        return { ...experiment, status: "running" as const, updatedAt: now() }
      }),

    recordExperimentExposure: async (command: import("@/packages/backend-contracts/provider").RecordExperimentExposureCommand) =>
      this.withIdempotency("recordExperimentExposure", command.idempotencyKey, async () => {
        const existing = await this.one("SELECT * FROM experiment_exposures WHERE experiment_id = ? AND visitor_id = ?", [command.experimentId, command.visitorId])
        if (existing) {
          return { variantId: String(existing.variant_id), versionId: String(existing.version_id) }
        }
        const experiment = await this.experiments.get(command.experimentId)
        if (!experiment) throw new Error("Experiment not found.")
        if (experiment.status !== "running") throw new Error("Experiment is not running.")
        const variant = chooseVariant(experiment.variants, command.visitorId)
        await this.client.execute({
          sql: "INSERT INTO experiment_exposures (id, experiment_id, visitor_id, variant_id, version_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          args: [createDomainId(), command.experimentId, command.visitorId, variant.id, variant.versionId, now()],
        })
        return { variantId: variant.id, versionId: variant.versionId }
      }),

    rollbackPublishedVersion: async (command: RollbackPublishedVersionCommand) =>
      this.withIdempotency("rollbackPublishedVersion", command.idempotencyKey, async () => {
        const current = await this.getVisualization(command.visualizationId)
        if (!current) throw new Error("Visualization not found.")
        if (current.draftRevision !== command.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.draftRevision, visualization: current }
        }
        const version = await this.versions.get(command.versionId)
        if (!version || version.visualizationId !== current.id) throw new Error("Version not found.")
        const updatedAt = now()
        await this.client.execute({
          sql: "UPDATE visualizations SET published_version_id = ?, updated_at = ? WHERE id = ?",
          args: [version.id, updatedAt, current.id],
        })
        const visualization = await this.getVisualization(current.id)
        if (!visualization) throw new Error("Visualization not found after rollback.")
        return { status: "published" as const, visualization, version }
      }),
  }

  private async getVisualization(id: string): Promise<VisualizationRecord | null> {
    const row = await this.one("SELECT * FROM visualizations WHERE id = ?", [id])
    return row ? mapVisualization(row) : null
  }

  private async withIdempotency<T>(command: string, key: string, work: () => Promise<T>): Promise<T> {
    const existing = await this.one("SELECT result_json FROM idempotency_records WHERE key = ?", [key])
    if (existing) {
      return JSON.parse(String(existing.result_json)) as T
    }
    const result = await work()
    await this.client.execute({
      sql: "INSERT OR IGNORE INTO idempotency_records (key, command, result_json, created_at) VALUES (?, ?, ?, ?)",
      args: [key, command, JSON.stringify(result), now()],
    })
    return result
  }

  private async one(sql: string, args: InArgs = []): Promise<Row | null> {
    await this.migrate()
    const result = await this.client.execute({ sql, args })
    return result.rows[0] ?? null
  }

  private async all(sql: string, args: InArgs = []): Promise<Row[]> {
    await this.migrate()
    const result = await this.client.execute({ sql, args })
    return result.rows
  }
}

export function createLocalPersistenceProvider(options?: LocalPersistenceOptions) {
  return new LocalPersistenceProvider(options)
}

function now() {
  return new Date().toISOString()
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapUser(row: Row): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapSession(row: Row): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
  }
}

function mapTeam(row: Row): TeamRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    brand: json<Record<string, unknown>>(row.brand_json, {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMembership(row: Row): MembershipRecord {
  return {
    teamId: String(row.team_id),
    userId: String(row.user_id),
    role: String(row.role) as MembershipRecord["role"],
    createdAt: String(row.created_at),
  }
}

function mapInvite(row: Row): InviteRecord {
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
    createdAt: String(row.created_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
  }
}

function mapWorkspace(row: Row): WorkspaceRecord {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapVisualization(row: Row): VisualizationRecord {
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
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedVersionId: row.published_version_id ? String(row.published_version_id) : null,
    passwordProtected: Boolean(row.password_protected),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
  }
}

function mapVersion(row: Row): VisualizationVersion {
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
    createdAt: String(row.created_at),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
  }
}

function mapCheckpoint(row: Row): VisualizationCheckpointRecord {
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
    createdAt: String(row.created_at),
  }
}

function mapSource(row: Row): VisualizationSourceRecord {
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
    createdAt: String(row.created_at),
  }
}

function mapAsset(row: Row): VisualizationAssetRecord {
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
    createdAt: String(row.created_at),
  }
}

function mapReviewRequest(row: Row): ReviewRequestRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    versionId: String(row.version_id),
    tokenHash: String(row.token_hash),
    title: String(row.title),
    status: String(row.status) as ReviewRequestRecord["status"],
    createdAt: String(row.created_at),
  }
}

function mapReviewComment(row: Row): ReviewCommentRecord {
  return {
    id: String(row.id),
    reviewRequestId: String(row.review_request_id),
    authorName: String(row.author_name),
    body: String(row.body),
    anchor: json(row.anchor_json, { nodeKind: "visualization", nodeId: "" }),
    status: String(row.status) as ReviewCommentRecord["status"],
    suggestedPatch: row.suggested_patch_json ? json(row.suggested_patch_json, null) : null,
    parentCommentId: row.parent_comment_id ? String(row.parent_comment_id) : null,
    createdAt: String(row.created_at),
    appliedAt: row.applied_at ? String(row.applied_at) : null,
  }
}

function mapAnalyticsEvent(row: Row): AnalyticsEventRecord {
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
    createdAt: String(row.created_at),
  }
}

function mapLead(row: Row): LeadRecord {
  return {
    id: String(row.id),
    visualizationId: row.visualization_id ? String(row.visualization_id) : null,
    publicId: String(row.public_id),
    versionId: row.version_id ? String(row.version_id) : null,
    visitorId: row.visitor_id ? String(row.visitor_id) : null,
    fields: json<Record<string, string>>(row.fields_json, {}),
    createdAt: String(row.created_at),
  }
}

function mapExperiment(row: Row): ExperimentRecord {
  return {
    id: String(row.id),
    visualizationId: String(row.visualization_id),
    name: String(row.name),
    question: String(row.question),
    status: String(row.status) as ExperimentRecord["status"],
    fallbackVersionId: String(row.fallback_version_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapVariant(row: Row): ExperimentVariantRecord {
  return {
    id: String(row.id),
    experimentId: String(row.experiment_id),
    label: String(row.label),
    versionId: String(row.version_id),
    weight: Number(row.weight),
  }
}

function mapWorkflowRun(row: Row): WorkflowRunRecord {
  return {
    id: String(row.id),
    visualizationId: row.visualization_id ? String(row.visualization_id) : null,
    kind: String(row.kind),
    status: String(row.status) as WorkflowRunRecord["status"],
    input: json<Record<string, unknown>>(row.input_json, {}),
    output: row.output_json ? json<Record<string, unknown>>(row.output_json, {}) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
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
