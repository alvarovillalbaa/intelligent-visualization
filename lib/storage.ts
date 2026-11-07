import path from "path"

import { nanoid } from "nanoid"

import { slugify } from "@/lib/utils"
import { getStorageAdapter } from "@/lib/storage/factory"
import { normalizeStorageKey } from "@/packages/storage/provider"

const storageRoot = path.join(process.cwd(), ".slides-storage")
export const LEGACY_STORAGE_PREFIX = "legacy-slides/"

async function legacyStorage() {
  const selected = await getStorageAdapter()
  if (selected.kind !== "local") return { adapter: selected, prefix: LEGACY_STORAGE_PREFIX }
  // Legacy Slides and canonical visualizations retain their distinct local roots.
  const { LocalStorageAdapter } = await import("@/packages/storage/local")
  return { adapter: new LocalStorageAdapter(storageRoot), prefix: "" }
}

function checkedKey(key: string) {
  if (key !== normalizeStorageKey(key) || Buffer.byteLength(key) > 1024) throw new Error("Invalid legacy storage key.")
  return key
}

function toPosixSegments(value: string) {
  return value.split("/").filter(Boolean).map((segment) => slugify(segment) || "file")
}

function joinStorageKey(...segments: string[]) {
  return segments
    .flatMap((segment, index) => {
      if (index === segments.length - 1 && path.extname(segment)) {
        const ext = path.extname(segment)
        const name = slugify(path.basename(segment, ext)) || "file"
        return `${name}${ext.toLowerCase()}`
      }

      return toPosixSegments(segment)
    })
    .join("/")
}

function getExtension(fileName: string, fallback = ".bin") {
  const ext = path.extname(fileName)
  return ext ? ext.toLowerCase() : fallback
}

export function getStoredFileUrl(storageKey: string) {
  return `/files/${checkedKey(storageKey)}`
}

export function getPublishedArtifactUrl(publicId: string, versionId: string) {
  return `/published/${publicId}/${versionId}`
}

export async function writeStoredBuffer(input: {
  namespace: string[]
  fileName: string
  content: Buffer
  contentType?: string
}) {
  const content = Buffer.from(input.content)
  const contentType = input.contentType || "application/octet-stream"
  const ext = getExtension(input.fileName)
  const baseName = slugify(path.basename(input.fileName, ext)) || "asset"
  const storageKey = checkedKey(joinStorageKey(...input.namespace, `${baseName}-${nanoid(6)}${ext}`))
  const { adapter, prefix } = await legacyStorage()
  await adapter.put({ key: prefix + storageKey, body: content, contentType, immutable: true })

  return {
    storageKey,
    url: getStoredFileUrl(storageKey),
    contentType,
    sizeBytes: content.byteLength,
  }
}

export async function writeStoredText(input: {
  namespace: string[]
  fileName: string
  content: string
  contentType?: string
}) {
  return writeStoredBuffer({
    namespace: input.namespace,
    fileName: input.fileName,
    content: Buffer.from(input.content, "utf8"),
    contentType: input.contentType,
  })
}

export async function writePublishedArtifact(input: {
  publicId: string
  versionId: string
  html: string
  metadata: Record<string, unknown>
}) {
  const html = Buffer.from(input.html, "utf8"), metadata = Buffer.from(JSON.stringify(input.metadata, null, 2), "utf8")
  const artifactStorageKey = checkedKey(joinStorageKey("published", input.publicId, input.versionId, "index.html"))
  const manifestStorageKey = checkedKey(joinStorageKey("published", input.publicId, input.versionId, "manifest.json"))
  const { adapter, prefix } = await legacyStorage()
  await adapter.put({ key: prefix + artifactStorageKey, body: html, contentType: "text/html; charset=utf-8", immutable: true })
  await adapter.put({ key: prefix + manifestStorageKey, body: metadata, contentType: "application/json", immutable: true })

  return {
    artifactStorageKey,
    manifestStorageKey,
    artifactUrl: getPublishedArtifactUrl(input.publicId, input.versionId),
  }
}

export async function readStoredFile(storageKey: string) {
  const key = checkedKey(storageKey)
  const { adapter, prefix } = await legacyStorage()
  return (await adapter.get({ key: prefix + key }))?.body ?? null
}

export async function readPublishedArtifact(publicId: string, versionId: string) {
  const artifactStorageKey = joinStorageKey("published", publicId, versionId, "index.html")
  return readStoredFile(artifactStorageKey)
}
