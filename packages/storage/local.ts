import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { normalizeStorageKey, type DeleteObjectInput, type ExistsInput, type GetObjectInput, type PutObjectInput, type StorageAdapter, type StoredObject } from "./provider"

export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = "local" as const

  constructor(private readonly rootDir = process.env.LOCAL_STORAGE_DIR ?? ".data/storage") {}

  async health() {
    await fs.mkdir(this.rootDir, { recursive: true })
    return {
      ok: true,
      message: "Local filesystem storage is writable.",
      checkedAt: new Date().toISOString(),
      details: { rootDir: this.rootDir },
    }
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const key = normalizeStorageKey(input.key)
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body)
    const absolutePath = this.absolutePath(key)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    if (input.immutable && (await this.exists({ key }))) {
      throw new Error(`Immutable object already exists: ${key}`)
    }
    await fs.writeFile(absolutePath, body)
    return {
      key,
      body,
      contentType: input.contentType,
      sizeBytes: body.byteLength,
      contentHash: createHash("sha256").update(body).digest("hex"),
      url: this.getPublicUrl(key),
    }
  }

  async get(input: GetObjectInput): Promise<StoredObject | null> {
    const key = normalizeStorageKey(input.key)
    try {
      const body = await fs.readFile(this.absolutePath(key))
      return {
        key,
        body,
        contentType: contentTypeForKey(key),
        sizeBytes: body.byteLength,
        contentHash: createHash("sha256").update(body).digest("hex"),
        url: this.getPublicUrl(key),
      }
    } catch {
      return null
    }
  }

  async delete(input: DeleteObjectInput): Promise<void> {
    const key = normalizeStorageKey(input.key)
    await fs.rm(this.absolutePath(key), { force: true })
  }

  async exists(input: ExistsInput): Promise<boolean> {
    const key = normalizeStorageKey(input.key)
    try {
      await fs.access(this.absolutePath(key))
      return true
    } catch {
      return false
    }
  }

  getPublicUrl(key: string): string | null {
    return `/files/${normalizeStorageKey(key)}`
  }

  private absolutePath(key: string) {
    const resolved = path.resolve(this.rootDir, normalizeStorageKey(key))
    const root = path.resolve(this.rootDir)
    if (!resolved.startsWith(root)) {
      throw new Error("Storage key escapes local storage root.")
    }
    return resolved
  }
}

function contentTypeForKey(key: string) {
  if (key.endsWith(".html")) return "text/html; charset=utf-8"
  if (key.endsWith(".json")) return "application/json"
  if (key.endsWith(".svg")) return "image/svg+xml"
  if (key.endsWith(".png")) return "image/png"
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg"
  return "application/octet-stream"
}
