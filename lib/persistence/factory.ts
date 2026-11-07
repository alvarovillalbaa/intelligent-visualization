import type { PersistenceKind, PersistenceProvider } from "@/packages/backend-contracts/provider"

let cachedProvider: PersistenceProvider | null = null
let pendingSupabaseProvider: Promise<PersistenceProvider> | null = null

export function resolvePersistenceKind(value = process.env.PERSISTENCE_PROVIDER ?? "local"): PersistenceKind {
  if (value === "local" || value === "supabase") {
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

  if (!pendingSupabaseProvider) {
    pendingSupabaseProvider = (async () => {
      const { createSupabasePersistenceProvider } = await import("@/packages/provider-supabase/adapter")
      const provider = createSupabasePersistenceProvider()
      try {
        if (!(await provider.health()).ok) throw new Error("Supabase persistence is unavailable.")
        cachedProvider = provider
        return provider
      } catch (error) {
        try { await provider.close() }
        catch (cleanup) { throw new AggregateError([error, cleanup], "Supabase persistence initialization and cleanup failed.") }
        throw error
      }
    })().finally(() => { pendingSupabaseProvider = null })
  }
  return pendingSupabaseProvider
}

export function setPersistenceProviderForTests(provider: PersistenceProvider | null) {
  cachedProvider = provider
}
