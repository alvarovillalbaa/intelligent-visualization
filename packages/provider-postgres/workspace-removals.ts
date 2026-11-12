import { WorkspaceDraftAccessError, type WorkspaceDraftAccess } from "@/packages/backend-contracts/workspace-drafts"
import type { RemoveWorkspaceDraftInput, WorkspaceRemovalRepository, WorkspaceRemovalResult } from "@/packages/backend-contracts/workspace-removals"
import { isDomainId } from "@/packages/domain/ids"
import { contentHash } from "@/packages/domain/serialization"
import { postgresSchema, type PostgresContext } from "./context"
import { withLegacyRepositoryState } from "./legacy-state"
import { authorizeWorkspaceDraftAccess, verifyWorkspaceDraftProjection, type WorkspaceDraftScope } from "./workspace-drafts"

const COMMAND = "workspaceDraftRemove:v1"
const ACTIVE = ["draft", "preview", "published", "archived"]
const HASH = /^[a-f0-9]{64}$/
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",")
const fail = (code: WorkspaceDraftAccessError["code"]): never => { throw new WorkspaceDraftAccessError(code) }
function normalize(value: RemoveWorkspaceDraftInput) {
  if (!object(value) || !exact(value, ["id", "requestId", "expected"]) || typeof value.id !== "string" || !isDomainId(value.id)
    || typeof value.requestId !== "string" || !isDomainId(value.requestId)
    || !object(value.expected) || !exact(value.expected, ["draftRevision", "draftHash", "status", "publishedVersionId"])) fail("INVALID_INPUT")
  const e = value.expected
  if (!Number.isSafeInteger(e.draftRevision) || e.draftRevision < 1 || e.draftRevision > 2_147_483_646
    || typeof e.draftHash !== "string" || !HASH.test(e.draftHash) || !ACTIVE.includes(e.status)
    || !(e.publishedVersionId === null || isDomainId(e.publishedVersionId))) fail("INVALID_INPUT")
  return { id: value.id.toLowerCase(), requestId: value.requestId.toLowerCase(), expected: {
    draftRevision: e.draftRevision, draftHash: e.draftHash, status: e.status,
    publishedVersionId: e.publishedVersionId?.toLowerCase() ?? null,
  } }
}
type Current = WorkspaceRemovalResult["current"]
export function createWorkspaceRemovalRepository(context: PostgresContext): WorkspaceRemovalRepository {
  const database = context.database, SCHEMA = postgresSchema(context.schema)
  async function access<T>(input: WorkspaceDraftAccess, write: boolean, work: (scope: WorkspaceDraftScope) => Promise<T>) {
    await context.ensure()
    return withLegacyRepositoryState((state) => work(authorizeWorkspaceDraftAccess(state, input, write)), context)
  }
  async function load(id: string, scope: WorkspaceDraftScope) {
    if (!await verifyWorkspaceDraftProjection(database, scope, SCHEMA)) return null
    const row = (await database.query(`SELECT id, kind, title, status, draft_revision, draft_hash, published_version_id, draft_document_json
      FROM ${SCHEMA}.visualizations WHERE id = $1 AND team_id = $2 AND workspace_id = $3 AND kind IN ('course', 'report') FOR UPDATE`,
    [id, scope.teamId, scope.workspaceId])).rows[0]
    if (!row) return null
    if (![...ACTIVE, "removed"].includes(String(row.status)) || !HASH.test(String(row.draft_hash))
      || !object(row.draft_document_json) || row.draft_document_json.kind !== row.kind || contentHash(row.draft_document_json) !== row.draft_hash
      || !Number.isSafeInteger(Number(row.draft_revision)) || Number(row.draft_revision) < 1
      || (row.published_version_id != null && (typeof row.published_version_id !== "string" || !isDomainId(row.published_version_id)))) fail("NOT_FOUND")
    const current: Current = { id: String(row.id), status: row.status as Current["status"], draftRevision: Number(row.draft_revision),
      draftHash: String(row.draft_hash), publishedVersionId: row.published_version_id == null ? null : String(row.published_version_id) }
    return { current, kind: row.kind as "course" | "report", title: String(row.title).slice(0, 240) }
  }
  return {
    async get(input, id) {
      if (typeof id !== "string" || !isDomainId(id)) fail("INVALID_INPUT")
      return access(input, false, async (scope) => {
        const row = await load(id.toLowerCase(), scope)
        if (!row || row.current.status === "removed") return null
        return { ...row.current, status: row.current.status, kind: row.kind, title: row.title }
      })
    },
    async remove(input, value) {
      const intent = normalize(value)
      return access<WorkspaceRemovalResult>(input, true, async (scope) => {
        const row = await load(intent.id, scope)
        if (!row) fail("NOT_FOUND")
        const binding = { actorId: scope.actorId, teamId: scope.teamId, workspaceId: scope.workspaceId, ...intent }
        const requestHash = contentHash(binding), key = `${COMMAND}:${intent.requestId}`
        const prior = (await database.query(`SELECT command, result_json FROM ${SCHEMA}.idempotency_records WHERE key = $1 FOR UPDATE`, [key])).rows[0]
        if (prior) {
          const envelope = prior.result_json
          if (prior.command !== COMMAND || !object(envelope) || envelope.formatVersion !== 1 || envelope.requestHash !== requestHash
            || !object(envelope.binding) || contentHash(envelope.binding) !== requestHash || !object(envelope.receipt)) fail("INVALID_INPUT")
          const r = envelope.receipt
          if (!exact(r, ["requestId", "status", "removedAt"]) || r.requestId !== intent.requestId || !["removed", "conflict"].includes(String(r.status))
            || (r.status === "removed" ? typeof r.removedAt !== "string" || !Number.isFinite(Date.parse(r.removedAt)) : r.removedAt !== null)) fail("INVALID_INPUT")
          const receipt: WorkspaceRemovalResult["receipt"] = { requestId: intent.requestId, status: r.status as "removed" | "conflict", removedAt: r.removedAt as string | null }
          return { status: receipt.status === "removed" && row.current.status === "removed" ? "removed" : "conflict", current: row.current, receipt }
        }
        const actual = { draftRevision: row.current.draftRevision, draftHash: row.current.draftHash,
          status: row.current.status, publishedVersionId: row.current.publishedVersionId }
        const matched = row.current.status !== "removed" && contentHash(actual) === contentHash(intent.expected)
        const removedAt = matched ? new Date().toISOString() : null
        if (matched) {
          await database.query(`UPDATE ${SCHEMA}.visualization_versions SET status = 'revoked' WHERE visualization_id = $1 AND status = 'published'`, [intent.id])
          const result = await database.query(`UPDATE ${SCHEMA}.visualizations SET status = 'removed', updated_at = $2 WHERE id = $1`, [intent.id, removedAt])
          if (result.rowCount !== 1) fail("NOT_FOUND")
        }
        const receipt: WorkspaceRemovalResult["receipt"] = { requestId: intent.requestId, status: matched ? "removed" : "conflict", removedAt }
        await database.query(`INSERT INTO ${SCHEMA}.idempotency_records (key, command, result_json, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
        [key, COMMAND, JSON.stringify({ formatVersion: 1, requestHash, binding, receipt }), removedAt ?? new Date().toISOString()])
        return { status: receipt.status, current: matched ? { ...row.current, status: "removed" } : row.current, receipt }
      })
    },
  }
}
