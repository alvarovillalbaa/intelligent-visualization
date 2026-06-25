import type { StorageAdapter, StorageKind } from "@/packages/storage/provider"

let cachedStorage: StorageAdapter | null = null

export function resolveStorageKind(
  persistenceProvider = process.env.PERSISTENCE_PROVIDER ?? "local",
  storageProvider = process.env.STORAGE_PROVIDER ?? "auto",
): StorageKind {
  if (storageProvider !== "auto") {
    return storageProvider as StorageKind
  }

  if (persistenceProvider === "convex") return "convex"
  if (persistenceProvider === "supabase") return "supabase"
  if (persistenceProvider === "cloudflare") return "cloudflare-r2"
  return "local"
}

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (cachedStorage) return cachedStorage

  const kind = resolveStorageKind()
  if (kind === "local") {
    const { LocalStorageAdapter } = await import("@/packages/storage/local")
    cachedStorage = new LocalStorageAdapter()
    return cachedStorage
  }

  throw new Error(`Storage provider "${kind}" is not implemented in this build slice.`)
}

export function setStorageAdapterForTests(adapter: StorageAdapter | null) {
  cachedStorage = adapter
}
