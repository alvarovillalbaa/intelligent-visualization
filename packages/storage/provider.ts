import type { ProviderHealth } from "@/packages/domain/entities"

export type StorageKind = "local" | "vercel-blob" | "convex" | "supabase" | "cloudflare-r2"

export interface PutObjectInput {
  key: string
  body: Buffer | Uint8Array | string
  contentType: string
  immutable?: boolean
}

export interface GetObjectInput {
  key: string
}

export interface DeleteObjectInput {
  key: string
}

export interface ExistsInput {
  key: string
}

export interface StoredObject {
  key: string
  body?: Buffer
  contentType: string
  sizeBytes: number
  contentHash: string
  url: string | null
}

export interface StorageAdapter {
  readonly kind: StorageKind

  health(): Promise<ProviderHealth>
  put(input: PutObjectInput): Promise<StoredObject>
  get(input: GetObjectInput): Promise<StoredObject | null>
  delete(input: DeleteObjectInput): Promise<void>
  exists(input: ExistsInput): Promise<boolean>
  getPublicUrl(key: string): string | null
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string>
}

export function normalizeStorageKey(key: string): string {
  const normalized = key
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("/")

  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid storage key.")
  }

  return normalized
}
