import { createHash } from "node:crypto"

import { normalizeStorageKey, type StorageAdapter, type PutObjectInput, type StoredObject } from "@/packages/storage/provider"

export const SUPABASE_OBJECT_LIMIT = 64 * 1024 * 1024
export const SUPABASE_STORAGE_TIMEOUT_MS = 15000
const CONTROL_LIMIT = 64 * 1024

export interface SupabaseStorageConfig {
  url: string
  serviceRoleKey: string
  bucket: string
}

export class SupabaseStorageError extends Error {
  readonly code: "EEXIST" | "STORAGE_UNAVAILABLE" | "STORAGE_INVALID"
  constructor(code: SupabaseStorageError["code"] = "STORAGE_UNAVAILABLE") {
    super(code === "EEXIST" ? "The immutable storage object already exists." : code === "STORAGE_INVALID" ? "Invalid private storage input." : "Private storage is unavailable.")
    this.name = "SupabaseStorageError"
    this.code = code
  }
}

export function getSupabaseStorageConfig(): SupabaseStorageConfig {
  return validateConfig({ url: process.env.SUPABASE_URL ?? "", serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "" })
}

function validateConfig(input: SupabaseStorageConfig): SupabaseStorageConfig {
  let url: URL
  try { url = new URL(input.url) } catch { throw new SupabaseStorageError("STORAGE_INVALID") }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || !input.serviceRoleKey || input.serviceRoleKey.length > 8192 || /[\s\u0000-\u001f\u007f]/.test(input.serviceRoleKey)
    || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(input.bucket) || input.bucket.includes("..")) throw new SupabaseStorageError("STORAGE_INVALID")
  return { url: url.origin, serviceRoleKey: input.serviceRoleKey, bucket: input.bucket }
}

function keyOf(value: string) {
  if (typeof value !== "string" || Buffer.byteLength(value) > 1024) throw new SupabaseStorageError("STORAGE_INVALID")
  try { if (normalizeStorageKey(value) !== value) throw new Error() } catch { throw new SupabaseStorageError("STORAGE_INVALID") }
  return value
}

function hash(value: Buffer) { return createHash("sha256").update(value).digest("hex") }

function json(value: Buffer): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) }
  catch { throw new SupabaseStorageError() }
}

function errorCode(value: Buffer) {
  const parsed = json(value)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const row = parsed as Record<string, unknown>
  return typeof row.code === "string" ? row.code : typeof row.error === "string" ? row.error : null
}

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly kind = "supabase" as const
  private readonly config: SupabaseStorageConfig
  constructor(config: SupabaseStorageConfig, private readonly fetcher: typeof fetch = fetch) {
    this.config = validateConfig(config)
  }

  private async request(suffix: string, method = "GET", body?: BodyInit, headers: Record<string, string> = {}, limit = CONTROL_LIMIT) {
    const controller = new AbortController()
    let rejectAbort: (reason: Error) => void = () => {}
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
    const onAbort = () => rejectAbort(new SupabaseStorageError())
    controller.signal.addEventListener("abort", onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), SUPABASE_STORAGE_TIMEOUT_MS)
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let complete = false
    try {
      const response = await Promise.race([this.fetcher(this.config.url + "/storage/v1/" + suffix, {
        method, body, signal: controller.signal, redirect: "error", cache: "no-store",
        // Opaque secret keys belong in apikey; legacy service-role JWTs also
        // authenticate Storage directly in Authorization.
        headers: { apikey: this.config.serviceRoleKey, ...(!this.config.serviceRoleKey.startsWith("sb_secret_")
          ? { Authorization: "Bearer " + this.config.serviceRoleKey } : {}), ...headers },
      }), aborted])
      reader = response.body?.getReader()
      const length = response.headers.get("content-length")
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new SupabaseStorageError()
      const chunks: Buffer[] = []
      let bytes = 0
      if (reader) while (true) {
        const part = await Promise.race([reader.read(), aborted])
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > limit) throw new SupabaseStorageError()
        chunks.push(Buffer.from(part.value))
      }
      complete = true
      return { status: response.status, body: Buffer.concat(chunks), contentType: response.headers.get("content-type") ?? "" }
    } catch { throw new SupabaseStorageError() }
    finally {
      clearTimeout(timer)
      controller.signal.removeEventListener("abort", onAbort)
      if (reader) {
        if (!complete) void reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    }
  }

  private async requirePrivateBucket() {
    const response = await this.request("bucket/" + encodeURIComponent(this.config.bucket))
    if (response.status !== 200) throw new SupabaseStorageError()
    const value = json(response.body)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseStorageError()
    const row = value as Record<string, unknown>
    if (row.id !== this.config.bucket || row.name !== this.config.bucket || row.public !== false) throw new SupabaseStorageError()
  }

  private objectPath(key: string) {
    return "object/" + encodeURIComponent(this.config.bucket) + "/" + key.split("/").map(encodeURIComponent).join("/")
  }

  async health() {
    try {
      await this.requirePrivateBucket()
      return { ok: true, message: "Private Supabase storage is available.", checkedAt: new Date().toISOString() }
    } catch {
      return { ok: false, message: "Private Supabase storage is unavailable.", checkedAt: new Date().toISOString() }
    }
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const key = keyOf(input.key)
    // Capture the supplied view and metadata before the first asynchronous step.
    const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.from(input.body)
    const contentType = input.contentType
    if (body.length > SUPABASE_OBJECT_LIMIT || !contentType || contentType.length > 256 || /[\r\n\u0000]/.test(contentType)) throw new SupabaseStorageError("STORAGE_INVALID")
    await this.requirePrivateBucket()
    const response = await this.request(this.objectPath(key), "POST", new Uint8Array(body), { "content-type": contentType, "x-upsert": "false", "cache-control": "max-age=0" })
    if (response.status !== 200 && response.status !== 201) {
      if ([400, 409].includes(response.status) && ["Duplicate", "ResourceAlreadyExists", "AlreadyExists"].includes(errorCode(response.body) ?? "")) throw new SupabaseStorageError("EEXIST")
      throw new SupabaseStorageError()
    }
    // Do not trust an acknowledgement or delete after an uncertain result.
    const stored = await this.get({ key })
    if (!stored || stored.sizeBytes !== body.length || stored.contentHash !== hash(body)) throw new SupabaseStorageError()
    return stored
  }

  async get(input: { key: string }): Promise<StoredObject | null> {
    const key = keyOf(input.key)
    await this.requirePrivateBucket()
    const response = await this.request(this.objectPath(key), "GET", undefined, {}, SUPABASE_OBJECT_LIMIT)
    if (response.status === 404 || response.status === 400 && ["NoSuchKey", "not_found"].includes(errorCode(response.body) ?? "")) return null
    if (response.status !== 200 || !response.contentType || response.contentType.length > 256 || /[\r\n\u0000]/.test(response.contentType)) throw new SupabaseStorageError()
    return { key, body: response.body, contentType: response.contentType, sizeBytes: response.body.length, contentHash: hash(response.body), url: this.getPublicUrl(key) }
  }

  async exists(input: { key: string }) { return (await this.get(input)) !== null }

  async delete(input: { key: string }) {
    const key = keyOf(input.key)
    await this.requirePrivateBucket()
    const response = await this.request("object/" + encodeURIComponent(this.config.bucket), "DELETE", JSON.stringify({ prefixes: [key] }), { "content-type": "application/json" })
    if (response.status !== 200) throw new SupabaseStorageError()
  }

  getPublicUrl(value: string) {
    const key = keyOf(value)
    if (key.split("/").some((part) => ["canonical-publications", "published"].includes(part.toLowerCase()))) return null
    return key.startsWith("legacy-slides/uploads/") ? "/files/" + key.slice("legacy-slides/".length) : null
  }
}

export function createSupabaseStorageAdapter(config = getSupabaseStorageConfig(), fetcher: typeof fetch = fetch) {
  return new SupabaseStorageAdapter(config, fetcher)
}
