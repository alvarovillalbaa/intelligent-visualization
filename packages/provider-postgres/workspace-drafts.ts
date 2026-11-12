import type { RepositoryState, TeamRecord, WorkspaceRecord } from "@/lib/types"
import type { PersistenceProvider } from "@/packages/backend-contracts/provider"
import {
  WorkspaceDraftAccessError,
  type SaveWorkspaceDraftInput,
  type SaveWorkspaceDraftResult,
  type WorkspaceDraft,
  type WorkspaceDraftAccess,
  type WorkspaceDraftDocument,
  type WorkspaceDraftRepository,
  type WorkspaceDraftSummary,
} from "@/packages/backend-contracts/workspace-drafts"
import type { VisualizationRecord } from "@/packages/domain/entities"
import { createPublicId, isDomainId } from "@/packages/domain/ids"
import { CURRENT_VISUALIZATION_SCHEMA_VERSION, migrateVisualizationDocument } from "@/packages/domain/migrations"
import { contentHash } from "@/packages/domain/serialization"
import type { PostgresDatabase } from "./database"
import { postgresSchema, type PostgresContext, type PostgresSchema } from "./context"
import { withLegacyRepositoryState } from "./legacy-state"

const COMMAND = "workspaceDraftSave:v1"
type Scope = {
  actorId: string
  teamId: string
  workspaceId: string
  workspaceSlug: string
  team: TeamRecord
  workspace: WorkspaceRecord
}
type Receipt = SaveWorkspaceDraftResult["receipt"]
type Envelope = { requestHash: string; receipt: Receipt }

function fail(code: WorkspaceDraftAccessError["code"]): never {
  throw new WorkspaceDraftAccessError(code)
}

function authorize(state: RepositoryState, access: WorkspaceDraftAccess, write: boolean): Scope {
  if (!access || typeof access.tokenHash !== "string" || !access.tokenHash) fail("UNAUTHENTICATED")
  const sessions = state.sessions.filter((session) => session.tokenHash === access.tokenHash)
  if (sessions.length !== 1 || !Number.isFinite(sessions[0].expiresAt) || sessions[0].expiresAt <= Date.now()) fail("UNAUTHENTICATED")
  const users = state.users.filter((user) => user.id === sessions[0].userId)
  if (users.length !== 1) fail("UNAUTHENTICATED")
  const user = users[0]
  const teams = state.teams.filter((team) => team.id === user.teamId)
  if (teams.length !== 1) fail("FORBIDDEN")
  const team = teams[0]
  const members = team.members.filter((member) => member.userId === user.id)
  if (members.length !== 1 || members[0].role !== user.role || !["admin", "editor", "viewer"].includes(user.role)) fail("FORBIDDEN")
  if (write && user.role === "viewer") fail("FORBIDDEN")
  const workspaces = state.workspaces.filter((workspace) => workspace.teamId === team.id && workspace.slug === access.workspaceSlug)
  if (workspaces.length !== 1) fail("NOT_FOUND")
  const workspace = workspaces[0]
  return { actorId: `legacy-user:${user.id}`, teamId: `legacy-team:${team.id}`,
    workspaceId: `legacy-workspace:${workspace.id}`, workspaceSlug: workspace.slug, team, workspace }
}

function summary(row: Record<string, unknown>): WorkspaceDraftSummary {
  return { id: String(row.id), kind: row.kind as WorkspaceDraftSummary["kind"], title: String(row.title),
    summary: String(row.description), draftRevision: Number(row.draft_revision), draftHash: String(row.draft_hash),
    createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) }
}

function timestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function inScope(record: VisualizationRecord, scope: Scope) {
  return record.teamId === scope.teamId && record.workspaceId === scope.workspaceId && ["course", "report"].includes(record.kind)
    && record.draftDocument.kind === record.kind
}

function draft(record: VisualizationRecord, scope: Scope): WorkspaceDraft {
  return { id: record.id, kind: record.kind as WorkspaceDraft["kind"], title: record.title, summary: record.description,
    draftRevision: record.draftRevision, draftHash: record.draftHash, createdAt: record.createdAt, updatedAt: record.updatedAt,
    workspaceSlug: scope.workspaceSlug, document: record.draftDocument as WorkspaceDraftDocument }
}

function normalize(input: SaveWorkspaceDraftInput) {
  if (!input || typeof input.id !== "string" || !isDomainId(input.id) || typeof input.requestId !== "string"
    || !isDomainId(input.requestId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) fail("INVALID_INPUT")
  let document
  try { document = migrateVisualizationDocument(input.document) } catch { fail("INVALID_INPUT") }
  if ((document.kind !== "course" && document.kind !== "report") || document.schemaVersion !== CURRENT_VISUALIZATION_SCHEMA_VERSION) fail("INVALID_INPUT")
  return { id: input.id.toLowerCase(), requestId: input.requestId.toLowerCase(), expectedRevision: input.expectedRevision, document }
}

function decodeCursor(cursor: string, scope: Scope): [string, string] {
  try {
    if (cursor.length > 512 || Buffer.from(cursor, "base64url").toString("base64url") !== cursor) fail("INVALID_INPUT")
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (!Array.isArray(value) || value.length !== 3 || value[0] !== scope.workspaceId
      || typeof value[1] !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value[1])
      || !Number.isFinite(Date.parse(value[1])) || typeof value[2] !== "string" || !isDomainId(value[2])) fail("INVALID_INPUT")
    return [value[1], value[2]]
  } catch { fail("INVALID_INPUT") }
}

async function verifyProjection(database: PostgresDatabase, scope: Pick<Scope, "teamId" | "workspaceId"> & { team: Pick<TeamRecord, "id"> }, schema: PostgresSchema): Promise<boolean> {
  const SCHEMA = postgresSchema(schema)
  const team = (await database.query(`SELECT brand_json FROM ${SCHEMA}.teams WHERE id = $1 FOR SHARE`, [scope.teamId])).rows[0]
  const workspace = (await database.query(`SELECT team_id FROM ${SCHEMA}.workspaces WHERE id = $1 FOR SHARE`, [scope.workspaceId])).rows[0]
  if (team) {
    const brand = team.brand_json as Record<string, unknown> | null
    if (!brand || brand.workspaceDraftBridge == null
      || contentHash(brand.workspaceDraftBridge) !== contentHash({ version: 1, legacyTeamId: scope.team.id })) fail("NOT_FOUND")
  }
  if (workspace && (!team || workspace.team_id !== scope.teamId)) fail("NOT_FOUND")
  return Boolean(team && workspace)
}

export { authorize as authorizeWorkspaceDraftAccess, inScope as workspaceDraftInScope, verifyProjection as verifyWorkspaceDraftProjection }
export type { Scope as WorkspaceDraftScope }

async function mirrorWorkspace(database: PostgresDatabase, scope: Scope, schema: PostgresSchema) {
  const SCHEMA = postgresSchema(schema)
  const now = new Date().toISOString()
  const marker = { version: 1, legacyTeamId: scope.team.id }
  await database.query(`INSERT INTO ${SCHEMA}.teams (id, slug, name, brand_json, created_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $5) ON CONFLICT (id) DO NOTHING`,
  [scope.teamId, `legacy-team-${scope.team.id}`, scope.team.name, JSON.stringify({ ...scope.team.brand, workspaceDraftBridge: marker }), now])
  const team = (await database.query(`SELECT brand_json FROM ${SCHEMA}.teams WHERE id = $1 FOR UPDATE`, [scope.teamId])).rows[0]
  const brand = team?.brand_json as Record<string, unknown> | undefined
  if (!brand || brand.workspaceDraftBridge == null || contentHash(brand.workspaceDraftBridge) !== contentHash(marker)) fail("NOT_FOUND")
  await database.query(`INSERT INTO ${SCHEMA}.workspaces (id, team_id, slug, name, description, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $6) ON CONFLICT (id) DO NOTHING`,
  [scope.workspaceId, scope.teamId, scope.workspace.slug, scope.workspace.name, scope.workspace.description, now])
  const workspace = (await database.query(`SELECT team_id FROM ${SCHEMA}.workspaces WHERE id = $1 FOR UPDATE`, [scope.workspaceId])).rows[0]
  if (workspace?.team_id !== scope.teamId) fail("NOT_FOUND")
}

// Both arguments come from the same adapter. Its pool context contains authorization,
// canonical rows and receipts in one transaction, including nested provider reads.
export function createWorkspaceDraftRepository(context: PostgresContext, provider: Pick<PersistenceProvider, "visualizations">): WorkspaceDraftRepository {
  const database = context.database, SCHEMA = postgresSchema(context.schema)
  async function access<T>(input: WorkspaceDraftAccess, write: boolean, work: (scope: Scope) => Promise<T>): Promise<T> {
    await context.ensure()
    return withLegacyRepositoryState((state) => work(authorize(state, input, write)), context)
  }
  async function current(id: string, scope: Scope) {
    const record = await provider.visualizations.get(id)
    return record && inScope(record, scope) ? record : null
  }
  return {
    async list(input, cursor = null, limit = 50) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (cursor !== null && (typeof cursor !== "string" || !cursor))) fail("INVALID_INPUT")
      return access(input, false, async (scope) => {
        const after = cursor ? decodeCursor(cursor, scope) : null
        if (!await verifyProjection(database, scope, SCHEMA)) return { items: [], nextCursor: null }
        const columns = `id, kind, title, description, draft_revision, draft_hash, created_at, updated_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at`
        const { rows } = await database.query(after
          ? `SELECT ${columns} FROM ${SCHEMA}.visualizations WHERE team_id = $1 AND workspace_id = $2
             AND kind IN ('course', 'report') AND status <> 'removed' AND (updated_at, id) < ($3::timestamptz, $4::text) ORDER BY updated_at DESC, id DESC LIMIT $5`
          : `SELECT ${columns} FROM ${SCHEMA}.visualizations WHERE team_id = $1 AND workspace_id = $2
             AND kind IN ('course', 'report') AND status <> 'removed' ORDER BY updated_at DESC, id DESC LIMIT $3`,
        after ? [scope.teamId, scope.workspaceId, ...after, limit + 1] : [scope.teamId, scope.workspaceId, limit + 1])
        const page = rows.slice(0, limit)
        const last = page[page.length - 1]
        return { items: page.map(summary), nextCursor: rows.length > limit
          ? Buffer.from(JSON.stringify([scope.workspaceId, last.cursor_updated_at, last.id])).toString("base64url") : null }
      })
    },
    async get(input, id) {
      if (typeof id !== "string" || !isDomainId(id)) fail("INVALID_INPUT")
      return access(input, false, async (scope) => {
        if (!await verifyProjection(database, scope, SCHEMA)) return null
        const record = await current(id.toLowerCase(), scope)
        return record ? draft(record, scope) : null
      })
    },
    async save(input, value) {
      const normalized = normalize(value)
      const documentHash = contentHash(normalized.document)
      const requestHash = contentHash(normalized)
      return access<SaveWorkspaceDraftResult>(input, true, async (scope) => {
        const key = `${COMMAND}:${contentHash([scope.actorId, scope.teamId, scope.workspaceId, normalized.id, normalized.requestId])}`
        await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key])
        await database.query(`SELECT id FROM ${SCHEMA}.visualizations WHERE id = $1 FOR UPDATE`, [normalized.id])
        const existing = await provider.visualizations.get(normalized.id)
        if (existing && !inScope(existing, scope)) fail("NOT_FOUND")
        if (existing && !await verifyProjection(database, scope, SCHEMA)) fail("NOT_FOUND")
        const stored = (await database.query(`SELECT command, result_json FROM ${SCHEMA}.idempotency_records WHERE key = $1`, [key])).rows[0]
        if (stored) {
          const envelope = stored.result_json as Envelope
          if (stored.command !== COMMAND || !envelope || envelope.requestHash !== requestHash) fail("INVALID_INPUT")
          if (!existing || existing.kind !== normalized.document.kind) fail("NOT_FOUND")
          return { status: envelope.receipt.status === "saved" && existing.draftHash === documentHash ? "saved" : "conflict",
            draft: draft(existing, scope), receipt: envelope.receipt }
        }
        if (existing && existing.kind !== normalized.document.kind) fail("NOT_FOUND")
        if (!existing && normalized.expectedRevision !== 0) fail("NOT_FOUND")
        let acceptedRevision: number | null = null
        if (!existing) {
          await mirrorWorkspace(database, scope, SCHEMA)
          const now = new Date().toISOString()
          const inserted = await database.query(`INSERT INTO ${SCHEMA}.visualizations
            (id, team_id, workspace_id, public_id, kind, slug, title, description, status, schema_version, draft_document_json,
             draft_hash, draft_revision, theme_mode, created_by, created_at, updated_at, published_version_id, password_protected, password_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10::jsonb, $11, 1, 'brand', $12, $13, $13, NULL, FALSE, NULL)
            ON CONFLICT (id) DO NOTHING`, [normalized.id, scope.teamId, scope.workspaceId, createPublicId(normalized.document.kind),
            normalized.document.kind, `${normalized.document.kind}-${normalized.id}`, normalized.document.title, normalized.document.summary,
            normalized.document.schemaVersion, JSON.stringify(normalized.document), documentHash, scope.actorId, now])
          if (inserted.rowCount === 1) acceptedRevision = 1
        } else if (existing.draftRevision === normalized.expectedRevision) {
          const updated = await database.query(`UPDATE ${SCHEMA}.visualizations SET title = $2, description = $3, schema_version = $4,
            draft_document_json = $5::jsonb, draft_hash = $6, draft_revision = draft_revision + 1, updated_at = $7
            WHERE id = $1 AND draft_revision = $8`, [normalized.id, normalized.document.title, normalized.document.summary,
            normalized.document.schemaVersion, JSON.stringify(normalized.document), documentHash, new Date().toISOString(), normalized.expectedRevision])
          if (updated.rowCount === 1) acceptedRevision = existing.draftRevision + 1
        }
        const saved = await current(normalized.id, scope)
        if (!saved || saved.kind !== normalized.document.kind) fail("NOT_FOUND")
        const receipt: Receipt = { requestId: normalized.requestId, status: acceptedRevision === null ? "conflict" : "saved", acceptedRevision, documentHash }
        await database.query(`INSERT INTO ${SCHEMA}.idempotency_records (key, command, result_json, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
          [key, COMMAND, JSON.stringify({ requestHash, receipt } satisfies Envelope), new Date().toISOString()])
        return { status: receipt.status === "saved" && saved.draftHash === documentHash ? "saved" : "conflict", draft: draft(saved, scope), receipt }
      })
    },
  }
}
