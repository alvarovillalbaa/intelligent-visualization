import { createHash } from "node:crypto"
import { z } from "zod"

import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { courseRuntimeScript } from "@/lib/artifacts/course"
import {
  WORKSPACE_PUBLICATION_NAMESPACE, WorkspacePublicationArtifactError,
  type PreparedWorkspacePublication, type PublicWorkspaceArtifact, type WorkspacePublicationArtifact, type WorkspacePublicationBinding,
} from "@/packages/backend-contracts/workspace-publications"
import { buildPublicationContentSecurityPolicy, isPublicationContentSecurityPolicy } from "@/packages/domain/publication-security"
import { contentHash } from "@/packages/domain/serialization"
import type { StorageAdapter, StoredObject } from "@/packages/storage/provider"

export const PUBLICATION_HTML_LIMIT = 8 * 1024 * 1024
export const PUBLICATION_ENVELOPE_LIMIT = 24 * 1024 * 1024
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/)
const bindingSchema = z.object({
  actorId: z.string().min(1), teamId: z.string().min(1), workspaceId: z.string().min(1),
  visualizationId: z.uuid(), publicId: z.string().regex(/^(course|report)_[0-9a-f]{32}$/), kind: z.enum(["course", "report"]),
  requestId: z.uuid(), versionId: z.uuid(), expectedRevision: z.number().int().positive(), expectedDraftHash: hashSchema,
}).strict()
const manifestSchema = z.object({
  visualizationId: z.string(), versionId: z.uuid(), kind: z.enum(["course", "report"]), schemaVersion: z.number().int().positive(),
  documentHash: hashSchema, artifactHash: hashSchema, createdAt: z.iso.datetime({ offset: true }),
  rendererVersion: z.enum(["visualization-course-public-v1", "visualization-report-public-v1"]),
  sourceHashes: z.array(z.string()), assetReferences: z.array(z.string()), runtimeFeatures: z.array(z.string()),
}).strict()
const envelopeSchema = z.object({
  formatVersion: z.literal(1), binding: bindingSchema, html: z.string(), manifest: manifestSchema,
  rawHtmlHash: hashSchema, contentSecurityPolicy: z.string(),
}).strict()
type PublicationEnvelope = z.infer<typeof envelopeSchema>

export function publicationByteHash(body: Buffer | string) {
  return createHash("sha256").update(body).digest("hex")
}

export function workspacePublicationStorageKey(binding: WorkspacePublicationBinding) {
  return `${WORKSPACE_PUBLICATION_NAMESPACE}/${binding.visualizationId}/${binding.versionId}/${contentHash(binding)}.json`
}

function verifyEnvelope(envelope: PublicationEnvelope) {
  const { binding, manifest, html } = envelope
  const bytes = Buffer.byteLength(html, "utf8")
  if (bytes === 0 || bytes > PUBLICATION_HTML_LIMIT || binding.publicId.split("_")[0] !== binding.kind
    || manifest.visualizationId !== binding.publicId || manifest.versionId !== binding.versionId || manifest.kind !== binding.kind
    || manifest.documentHash !== binding.expectedDraftHash || manifest.artifactHash !== contentHash(html)
    || manifest.rendererVersion !== `visualization-${binding.kind}-public-v1`
    || !manifest.runtimeFeatures.includes("no-analytics") || manifest.runtimeFeatures.includes("analytics-beacon")
    || envelope.rawHtmlHash !== publicationByteHash(html) || !isPublicationContentSecurityPolicy(envelope.contentSecurityPolicy)) {
    throw new WorkspacePublicationArtifactError()
  }
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => createHash("sha256").update(match[1]).digest("base64"))
  const allowed = Array.from(envelope.contentSecurityPolicy.matchAll(/'sha256-([A-Za-z0-9+/]{43}=)'/g), (match) => match[1])
  if ((html.match(/<script\b/gi) ?? []).length !== scripts.length || scripts.length !== allowed.length
    || scripts.some((hash, index) => hash !== allowed[index]) || (binding.kind === "course" ? scripts.length !== 1 : scripts.length !== 0)) {
    throw new WorkspacePublicationArtifactError()
  }
}

function decode(object: StoredObject, key: string) {
  if (!object.body || object.key !== key || object.body.byteLength > PUBLICATION_ENVELOPE_LIMIT
    || object.sizeBytes !== object.body.byteLength || object.contentHash !== publicationByteHash(object.body)) throw new WorkspacePublicationArtifactError()
  let envelope: PublicationEnvelope
  try { envelope = envelopeSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.body))) }
  catch { throw new WorkspacePublicationArtifactError() }
  verifyEnvelope(envelope)
  if (workspacePublicationStorageKey(envelope.binding) !== key) throw new WorkspacePublicationArtifactError()
  return envelope
}

function artifact(object: StoredObject, envelope: PublicationEnvelope): WorkspacePublicationArtifact {
  return { storageKey: object.key, storageHash: object.contentHash, artifactHash: envelope.manifest.artifactHash,
    manifest: { ...envelope.manifest, publication: {
      formatVersion: 1, bindingHash: contentHash(envelope.binding), sourceRevision: envelope.binding.expectedRevision,
      rawHtmlHash: envelope.rawHtmlHash, sizeBytes: Buffer.byteLength(envelope.html, "utf8"), storageHash: object.contentHash,
      storageBytes: object.sizeBytes, contentSecurityPolicy: envelope.contentSecurityPolicy,
    } } }
}

export async function stageWorkspacePublication(storage: StorageAdapter, prepared: PreparedWorkspacePublication): Promise<WorkspacePublicationArtifact> {
  const key = workspacePublicationStorageKey(prepared.binding)
  if (key !== prepared.artifactStorageKey || prepared.state.id !== prepared.binding.visualizationId || prepared.state.kind !== prepared.binding.kind
    || prepared.state.draftRevision !== prepared.binding.expectedRevision || prepared.document.kind !== prepared.binding.kind
    || prepared.state.draftHash !== prepared.binding.expectedDraftHash
    || contentHash(prepared.document) !== prepared.binding.expectedDraftHash) throw new WorkspacePublicationArtifactError()
  let object = await storage.get({ key })
  if (!object) {
    const compiled = await compileVisualizationArtifact(prepared.document, {
      visualizationId: prepared.binding.publicId, versionId: prepared.binding.versionId,
      createdAt: prepared.preparedAt, preview: false, analytics: false,
    })
    if (Buffer.byteLength(compiled.html, "utf8") > PUBLICATION_HTML_LIMIT) {
      const { WorkspaceDraftAccessError } = await import("@/packages/backend-contracts/workspace-drafts")
      throw new WorkspaceDraftAccessError("INVALID_INPUT")
    }
    const script = prepared.binding.kind === "course" ? courseRuntimeScript(false, false).slice("<script>".length, -"</script>".length) : null
    const envelope: PublicationEnvelope = { formatVersion: 1, binding: prepared.binding, html: compiled.html,
      manifest: compiled.manifest as PublicationEnvelope["manifest"], rawHtmlHash: publicationByteHash(compiled.html),
      contentSecurityPolicy: buildPublicationContentSecurityPolicy(script ? [createHash("sha256").update(script).digest("base64")] : []) }
    verifyEnvelope(envelope)
    const body = Buffer.from(JSON.stringify(envelope), "utf8")
    if (body.byteLength > PUBLICATION_ENVELOPE_LIMIT) {
      const { WorkspaceDraftAccessError } = await import("@/packages/backend-contracts/workspace-drafts")
      throw new WorkspaceDraftAccessError("INVALID_INPUT")
    }
    try { await storage.put({ key, body, contentType: "application/json", immutable: true }) }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error }
    // A lost acknowledgement or racing exclusive create is reconciled from durable
    // bytes. Never overwrite/delete an object or trust only the put acknowledgement.
    object = await storage.get({ key })
  }
  if (!object) throw new WorkspacePublicationArtifactError()
  const envelope = decode(object, key)
  if (contentHash(envelope.binding) !== contentHash(prepared.binding) || envelope.manifest.createdAt !== prepared.preparedAt) {
    throw new WorkspacePublicationArtifactError()
  }
  return artifact(object, envelope)
}

export async function readWorkspacePublication(storage: StorageAdapter, reference: PublicWorkspaceArtifact) {
  const object = await storage.get({ key: reference.storageKey })
  if (!object || object.contentHash !== reference.storageHash || object.sizeBytes !== reference.storageBytes) throw new WorkspacePublicationArtifactError()
  const envelope = decode(object, reference.storageKey)
  const validated = artifact(object, envelope)
  if (envelope.binding.publicId !== reference.publicId || envelope.binding.versionId !== reference.versionId
    || envelope.binding.kind !== reference.kind || envelope.manifest.documentHash !== reference.documentHash
    || validated.artifactHash !== reference.artifactHash || contentHash(validated.manifest) !== contentHash(reference.manifest)) {
    throw new WorkspacePublicationArtifactError()
  }
  return { html: envelope.html, contentSecurityPolicy: envelope.contentSecurityPolicy, rawHtmlHash: envelope.rawHtmlHash }
}
