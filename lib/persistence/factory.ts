import type { PersistenceKind, PersistenceProvider } from "@/packages/backend-contracts/provider"

let cachedProvider: PersistenceProvider | null = null

export function resolvePersistenceKind(value = process.env.PERSISTENCE_PROVIDER ?? "local"): PersistenceKind {
  if (value === "local" || value === "convex" || value === "supabase" || value === "cloudflare") {
    return value
  }
  throw new Error(`Invalid PERSISTENCE_PROVIDER "${value}".`)
}

export async function getPersistenceProvider(): Promise<PersistenceProvider> {
  if (cachedProvider) return cachedProvider

  const kind = resolvePersistenceKind()
  if (kind === "local") {
    const { createLocalPersistenceProvider } = await import("@/packages/provider-local/adapter")
    const provider = createLocalPersistenceProvider()
    await provider.health()
    cachedProvider = provider
    return provider
  }

  throw new Error(`Persistence provider "${kind}" is not implemented in this build slice.`)
}

export function setPersistenceProviderForTests(provider: PersistenceProvider | null) {
  cachedProvider = provider
}
