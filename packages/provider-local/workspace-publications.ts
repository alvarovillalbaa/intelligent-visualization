import type { PersistenceProvider } from "@/packages/backend-contracts/provider"
import { WorkspaceDraftAccessError, type WorkspaceDraftAccess, type WorkspaceDraftDocument } from "@/packages/backend-contracts/workspace-drafts"
import {
  WORKSPACE_PUBLICATION_NAMESPACE,
  WorkspacePublicationArtifactError,
  type PreparedWorkspacePublication,
  type PublicWorkspaceArtifact,
  type PublishWorkspaceDraftInput,
  type WorkspacePublicationArtifact,
  type WorkspacePublicationBinding,
  type WorkspacePublicationRepository,
  type WorkspacePublicationResult,
  type WorkspacePublicationState,
  type WorkspacePublishedVersion,
} from "@/packages/backend-contracts/workspace-publications"
import type { VisualizationRecord } from "@/packages/domain/entities"
import { isDomainId } from "@/packages/domain/ids"
import { migrateVisualizationDocument } from "@/packages/domain/migrations"
import { isPublicationContentSecurityPolicy } from "@/packages/domain/publication-security"
import { contentHash } from "@/packages/domain/serialization"
import { initializeLocalDatabase, type LocalDatabase } from "./database"
import { withLegacyRepositoryState } from "./legacy-state"
import { LOCAL_SCHEMA } from "./schema"
import { authorizeWorkspaceDraftAccess, verifyWorkspaceDraftProjection, workspaceDraftInScope, type WorkspaceDraftScope } from "./workspace-drafts"

const COMMAND = "workspacePublication:v1"
const VERSION_COMMAND = "workspacePublicationVersion:v1"
const HASH = /^[a-f0-9]{64}$/
type Row = Record<string, unknown>
type Receipt = WorkspacePublicationResult["receipt"]
type Envelope = {
  formatVersion: 1
  requestHash: string
  binding: WorkspacePublicationBinding
  preparedAt: string
  originalPointer: string | null
  phase: "prepared" | "final"
  receipt?: Receipt
}
type Identity = Pick<VisualizationRecord, "id" | "teamId" | "workspaceId" | "publicId" | "kind">
type VerifiedVersion = { artifact: PublicWorkspaceArtifact; publication: WorkspacePublishedVersion }

function fail(code: WorkspaceDraftAccessError["code"]): never { throw new WorkspaceDraftAccessError(code) }
function artifactFailure(): never { throw new WorkspacePublicationArtifactError() }
function object(value: unknown): Row | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null }
function timestamp(value: unknown) { return value instanceof Date ? value.toISOString() : String(value) }
function positive(value: unknown, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value) }
function requestKey(input: PublishWorkspaceDraftInput) { return `${COMMAND}:${input.requestId}` }
function versionKey(input: PublishWorkspaceDraftInput) { return `${VERSION_COMMAND}:${input.versionId}` }
function storageKey(binding: WorkspacePublicationBinding) {
  return `${WORKSPACE_PUBLICATION_NAMESPACE}/${binding.visualizationId}/${binding.versionId}/${contentHash(binding)}.json`
}
// Bound only the DTO summary; the version document and rendered title remain complete.
function summaryTitle(title: string) {
  let value = "", count = 0
  for (const character of title) {
    if (count === 1000) return value + "…"
    value += character
    count++
  }
  return value
}
function normalize(value: PublishWorkspaceDraftInput): PublishWorkspaceDraftInput {
  if (!value || [value.id, value.requestId, value.versionId].some((id) => typeof id !== "string" || !isDomainId(id))
    || !positive(value.expectedRevision, 2_147_483_646) || !hash(value.expectedDraftHash)) fail("INVALID_INPUT")
  return { id: value.id.toLowerCase(), requestId: value.requestId.toLowerCase(), versionId: value.versionId.toLowerCase(),
    expectedRevision: value.expectedRevision, expectedDraftHash: value.expectedDraftHash }
}
function bindingFor(record: VisualizationRecord, scope: WorkspaceDraftScope, input: PublishWorkspaceDraftInput): WorkspacePublicationBinding {
  return { actorId: scope.actorId, teamId: scope.teamId, workspaceId: scope.workspaceId, visualizationId: record.id,
    publicId: record.publicId, kind: record.kind as WorkspacePublicationBinding["kind"], requestId: input.requestId,
    versionId: input.versionId, expectedRevision: input.expectedRevision, expectedDraftHash: input.expectedDraftHash }
}

// This validates persisted version metadata, never a working draft or caller HTML.
function verifyVersion(record: Identity, row: Row): VerifiedVersion | null {
  try {
    const document = migrateVisualizationDocument(row.document_json)
    const manifest = object(row.manifest_json), publication = object(manifest?.publication)
    const versionId = String(row.id), createdAt = timestamp(row.created_at)
    if (!isDomainId(versionId) || row.visualization_id !== record.id || row.status !== "published" || row.password_hash != null
      || !["course", "report"].includes(record.kind) || document.kind !== record.kind || document.schemaVersion !== 1
      || row.schema_version !== document.schemaVersion || !hash(row.document_hash) || contentHash(document) !== row.document_hash
      || !hash(row.artifact_hash) || !manifest || !publication || publication.formatVersion !== 1
      || manifest.visualizationId !== record.publicId || manifest.versionId !== versionId || manifest.kind !== record.kind
      || manifest.schemaVersion !== document.schemaVersion || manifest.documentHash !== row.document_hash
      || manifest.artifactHash !== row.artifact_hash || manifest.createdAt !== createdAt || !Number.isFinite(Date.parse(createdAt))
      || manifest.rendererVersion !== `visualization-${record.kind}-public-v1`
      || !Array.isArray(manifest.sourceHashes) || contentHash(manifest.sourceHashes) !== contentHash(document.sourceManifest.map((source) => source.contentHash))
      || !Array.isArray(manifest.assetReferences) || contentHash(manifest.assetReferences) !== contentHash(document.assetIds)
      || !Array.isArray(manifest.runtimeFeatures) || manifest.runtimeFeatures.some((feature) => typeof feature !== "string")
      || !manifest.runtimeFeatures.includes("no-analytics") || !manifest.runtimeFeatures.includes("no-external-js")
      || manifest.runtimeFeatures.includes("analytics-beacon") || manifest.runtimeFeatures.includes("preview")
      || (record.kind === "course" && !manifest.runtimeFeatures.includes("local-course-progress"))
      || !hash(publication.bindingHash) || !positive(publication.sourceRevision, 2_147_483_646)
      || !hash(publication.rawHtmlHash) || !positive(publication.sizeBytes, 8 * 1024 * 1024)
      || !hash(publication.storageHash) || !positive(publication.storageBytes, 24 * 1024 * 1024)
      || publication.storageBytes <= publication.sizeBytes || !isPublicationContentSecurityPolicy(publication.contentSecurityPolicy)) return null
    const key = `${WORKSPACE_PUBLICATION_NAMESPACE}/${record.id}/${versionId}/${publication.bindingHash}.json`
    const publicUrl = `/v/${record.publicId}`, versionUrl = `${publicUrl}/${versionId}`
    if (row.artifact_storage_key !== key || row.artifact_url !== versionUrl || typeof row.created_by !== "string" || !row.created_by.startsWith("legacy-user:")) return null
    return {
      artifact: { publicId: record.publicId, versionId, kind: record.kind as PublicWorkspaceArtifact["kind"], storageKey: key,
        storageHash: publication.storageHash, storageBytes: publication.storageBytes, artifactHash: row.artifact_hash,
        documentHash: row.document_hash, manifest },
      publication: { publicId: record.publicId, versionId, sourceRevision: publication.sourceRevision, documentHash: row.document_hash,
        artifactHash: row.artifact_hash, createdAt, title: summaryTitle(document.title), publicUrl, versionUrl },
    }
  } catch { return null }
}

export function createWorkspacePublicationRepository(database: LocalDatabase, provider: Pick<PersistenceProvider, "visualizations">): WorkspacePublicationRepository {
  async function access<T>(input: WorkspaceDraftAccess, write: boolean, work: (scope: WorkspaceDraftScope) => Promise<T>): Promise<T> {
    await initializeLocalDatabase(database)
    return withLegacyRepositoryState((state) => work(authorizeWorkspaceDraftAccess(state, input, write)), database)
  }
  async function version(id: string) {
    return (await database.query(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_versions WHERE id = $1`, [id])).rows[0] ?? null
  }
  async function state(record: VisualizationRecord, scope: WorkspaceDraftScope): Promise<WorkspacePublicationState> {
    const published = record.status === "published" && !record.passwordProtected && record.passwordHash == null && record.publishedVersionId
      ? await version(record.publishedVersionId) : null
    return { id: record.id, workspaceSlug: scope.workspaceSlug, kind: record.kind as WorkspacePublicationState["kind"],
      draftRevision: record.draftRevision, draftHash: record.draftHash,
      current: published ? verifyVersion(record, published)?.publication ?? null : null }
  }
  async function load(id: string, scope: WorkspaceDraftScope, write: boolean) {
    if (write) await database.query(`SELECT id FROM ${LOCAL_SCHEMA}.visualizations WHERE id = $1 FOR UPDATE`, [id])
    if (!await verifyWorkspaceDraftProjection(database, scope)) return null
    const record = await provider.visualizations.get(id)
    if (!record || !workspaceDraftInScope(record, scope) || record.draftHash !== contentHash(record.draftDocument)) return null
    if (write) {
      const policy = (await database.query(`SELECT password_protected, password_hash FROM ${LOCAL_SCHEMA}.visualizations WHERE id = $1`, [id])).rows[0]
      const current = record.publishedVersionId ? await version(record.publishedVersionId) : null
      if (policy.password_protected || policy.password_hash != null || current?.password_hash != null) fail("FORBIDDEN")
      if (record.publishedVersionId && (!current || current.visualization_id !== id || current.status !== "published")) fail("NOT_FOUND")
    }
    return record
  }
  async function stored(input: PublishWorkspaceDraftInput, binding: WorkspacePublicationBinding): Promise<Envelope | null> {
    const row = (await database.query(`SELECT command, result_json FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1 FOR UPDATE`, [requestKey(input)])).rows[0]
    if (!row) return null
    const envelope = row.result_json as Envelope
    if (row.command !== COMMAND || !envelope || envelope.formatVersion !== 1 || !object(envelope.binding) || envelope.requestHash !== contentHash(binding)
      || contentHash(envelope.binding) !== contentHash(binding) || !["prepared", "final"].includes(envelope.phase)
      || typeof envelope.preparedAt !== "string" || !Number.isFinite(Date.parse(envelope.preparedAt))
      || (envelope.originalPointer !== null && typeof envelope.originalPointer !== "string")) fail("INVALID_INPUT")
    if (envelope.phase === "final") {
      const receipt = object(envelope.receipt)
      if (!receipt || receipt.requestId !== input.requestId || receipt.versionId !== input.versionId
        || receipt.documentHash !== input.expectedDraftHash || !["published", "conflict"].includes(String(receipt.status))) fail("INVALID_INPUT")
      if (receipt.status === "published") {
        const publication = object(receipt.publication)
        if (receipt.acceptedRevision !== input.expectedRevision || !publication || publication.publicId !== binding.publicId
          || publication.versionId !== input.versionId || publication.sourceRevision !== input.expectedRevision
          || publication.documentHash !== input.expectedDraftHash) fail("INVALID_INPUT")
      } else if (receipt.acceptedRevision !== null || receipt.publication !== null) fail("INVALID_INPUT")
    }
    const reservation = (await database.query(`SELECT command, result_json FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1`, [versionKey(input)])).rows[0]
    if (!reservation || reservation.command !== VERSION_COMMAND
      || contentHash(reservation.result_json) !== contentHash({ requestKey: requestKey(input), requestHash: envelope.requestHash })) fail("INVALID_INPUT")
    return envelope
  }
  async function saveEnvelope(input: PublishWorkspaceDraftInput, envelope: Envelope, insert: boolean) {
    const encoded = JSON.stringify(envelope)
    if (insert) {
      await database.query(`INSERT INTO ${LOCAL_SCHEMA}.idempotency_records (key, command, result_json, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
        [requestKey(input), COMMAND, encoded, envelope.preparedAt])
    } else {
      const updated = await database.query(`UPDATE ${LOCAL_SCHEMA}.idempotency_records SET result_json = $2::jsonb WHERE key = $1 AND command = $3`,
        [requestKey(input), encoded, COMMAND])
      if (updated.rowCount !== 1) fail("INVALID_INPUT")
    }
  }
  function unchanged(record: VisualizationRecord, envelope: Envelope) {
    return record.draftRevision === envelope.binding.expectedRevision && record.draftHash === envelope.binding.expectedDraftHash
      && record.publishedVersionId === envelope.originalPointer
  }
  async function result(record: VisualizationRecord, scope: WorkspaceDraftScope, envelope: Envelope): Promise<WorkspacePublicationResult> {
    if (!envelope.receipt) fail("INVALID_INPUT")
    const latest = await state(record, scope)
    const receipt = envelope.receipt
    return { status: receipt.status === "published" && receipt.acceptedRevision === record.draftRevision
      && receipt.documentHash === record.draftHash && latest.current?.versionId === receipt.versionId ? "published" : "conflict", state: latest, receipt }
  }
  async function conflict(record: VisualizationRecord, scope: WorkspaceDraftScope, input: PublishWorkspaceDraftInput, envelope: Envelope, insert = false) {
    envelope.phase = "final"
    envelope.receipt = { requestId: input.requestId, versionId: input.versionId, status: "conflict", acceptedRevision: null,
      documentHash: input.expectedDraftHash, publication: null }
    await saveEnvelope(input, envelope, insert)
    return result(record, scope, envelope)
  }
  return {
    async get(input, id) {
      if (typeof id !== "string" || !isDomainId(id)) fail("INVALID_INPUT")
      return access(input, false, async (scope) => {
        const record = await load(id.toLowerCase(), scope, false)
        return record ? state(record, scope) : null
      })
    },
    async prepare(input, value) {
      const intent = normalize(value)
      return access<PreparedWorkspacePublication | WorkspacePublicationResult>(input, true, async (scope) => {
        const record = await load(intent.id, scope, true)
        if (!record) fail("NOT_FOUND")
        const binding = bindingFor(record, scope, intent)
        const previous = await stored(intent, binding)
        if (previous?.phase === "final") return result(record, scope, previous)
        if (previous) {
          if (await version(intent.versionId)) fail("INVALID_INPUT")
          if (!unchanged(record, previous)) return conflict(record, scope, intent, previous)
          return { status: "ready", state: await state(record, scope), binding: previous.binding, preparedAt: previous.preparedAt,
            artifactStorageKey: storageKey(previous.binding), document: record.draftDocument as WorkspaceDraftDocument }
        }
        const existingVersion = await version(intent.versionId)
        const reserved = (await database.query(`SELECT key FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1`, [versionKey(intent)])).rows[0]
        if (existingVersion || reserved) fail("INVALID_INPUT")
        const envelope: Envelope = { formatVersion: 1, requestHash: contentHash(binding), binding, preparedAt: new Date().toISOString(),
          originalPointer: record.publishedVersionId, phase: "prepared" }
        await database.query(`INSERT INTO ${LOCAL_SCHEMA}.idempotency_records (key, command, result_json, created_at) VALUES ($1, $2, $3::jsonb, $4)`,
          [versionKey(intent), VERSION_COMMAND, JSON.stringify({ requestKey: requestKey(intent), requestHash: envelope.requestHash }), envelope.preparedAt])
        if (record.draftRevision !== intent.expectedRevision || record.draftHash !== intent.expectedDraftHash) return conflict(record, scope, intent, envelope, true)
        await saveEnvelope(intent, envelope, true)
        return { status: "ready", state: await state(record, scope), binding, preparedAt: envelope.preparedAt,
          artifactStorageKey: storageKey(binding), document: record.draftDocument as WorkspaceDraftDocument }
      })
    },
    async commit(input, value, artifact: WorkspacePublicationArtifact) {
      const intent = normalize(value)
      return access<WorkspacePublicationResult>(input, true, async (scope) => {
        const record = await load(intent.id, scope, true)
        if (!record) fail("NOT_FOUND")
        const binding = bindingFor(record, scope, intent)
        const envelope = await stored(intent, binding)
        if (!envelope) fail("INVALID_INPUT")
        if (envelope.phase === "final") return result(record, scope, envelope)
        if (!unchanged(record, envelope)) return conflict(record, scope, intent, envelope)
        if (await version(intent.versionId)) fail("INVALID_INPUT")
        const publication = object(object(artifact?.manifest)?.publication)
        if (!artifact || artifact.storageKey !== storageKey(binding) || !hash(artifact.storageHash) || !hash(artifact.artifactHash)
          || publication?.bindingHash !== contentHash(binding) || publication.sourceRevision !== intent.expectedRevision
          || publication.storageHash !== artifact.storageHash) artifactFailure()
        const row: Row = { id: intent.versionId, visualization_id: record.id, status: "published", schema_version: record.schemaVersion,
          document_json: record.draftDocument, document_hash: record.draftHash, artifact_storage_key: artifact.storageKey,
          artifact_url: `/v/${record.publicId}/${intent.versionId}`, artifact_hash: artifact.artifactHash, manifest_json: artifact.manifest,
          created_by: scope.actorId, created_at: envelope.preparedAt, password_hash: null }
        const verified = verifyVersion(record, row)
        if (!verified) artifactFailure()
        await database.query(`INSERT INTO ${LOCAL_SCHEMA}.visualization_versions
          (id, visualization_id, label, status, schema_version, document_json, document_hash, artifact_storage_key, artifact_url, artifact_hash, manifest_json, created_by, created_at, password_hash)
          VALUES ($1, $2, $3, 'published', $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11, $12, NULL)`,
        [intent.versionId, record.id, `Published revision ${intent.expectedRevision}`, record.schemaVersion, JSON.stringify(record.draftDocument), record.draftHash,
          artifact.storageKey, row.artifact_url, artifact.artifactHash, JSON.stringify(artifact.manifest), scope.actorId, envelope.preparedAt])
        await database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET status = 'published', published_version_id = $2, updated_at = $3 WHERE id = $1`,
          [record.id, intent.versionId, new Date().toISOString()])
        envelope.phase = "final"
        envelope.receipt = { requestId: intent.requestId, versionId: intent.versionId, status: "published", acceptedRevision: intent.expectedRevision,
          documentHash: record.draftHash, publication: verified.publication }
        await saveEnvelope(intent, envelope, false)
        const updated = await provider.visualizations.get(record.id)
        if (!updated) fail("NOT_FOUND")
        return result(updated, scope, envelope)
      })
    },
    async resolve(publicId, versionId) {
      if (typeof publicId !== "string" || !/^(course|report)_[a-f0-9]{32}$/.test(publicId)
        || (versionId !== undefined && (typeof versionId !== "string" || !isDomainId(versionId)))) return null
      await initializeLocalDatabase(database)
      return database.transaction(async () => {
        const row = (await database.query(`SELECT id, team_id, workspace_id, public_id, kind, status, published_version_id, password_protected, password_hash
          FROM ${LOCAL_SCHEMA}.visualizations WHERE public_id = $1 FOR SHARE`, [publicId])).rows[0]
        if (!row || row.status !== "published" || !row.published_version_id || row.password_protected || row.password_hash != null
          || typeof row.team_id !== "string" || !row.team_id.startsWith("legacy-team:") || typeof row.workspace_id !== "string"
          || !row.workspace_id.startsWith("legacy-workspace:") || !["course", "report"].includes(String(row.kind))) return null
        const identity: Identity = { id: String(row.id), teamId: row.team_id, workspaceId: row.workspace_id, publicId: String(row.public_id), kind: row.kind as Identity["kind"] }
        try {
          if (!await verifyWorkspaceDraftProjection(database, { teamId: identity.teamId, workspaceId: identity.workspaceId, team: { id: identity.teamId.slice("legacy-team:".length) } })) return null
        } catch (error) {
          if (error instanceof WorkspaceDraftAccessError && error.code === "NOT_FOUND") return null
          throw error
        }
        const current = await version(String(row.published_version_id))
        if (!current || current.visualization_id !== row.id || current.status !== "published" || current.password_hash != null) return null
        const target = versionId ? await version(versionId.toLowerCase()) : current
        return target ? verifyVersion(identity, target)?.artifact ?? null : null
      })
    },
  }
}
