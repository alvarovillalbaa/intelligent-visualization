import "./load-local-env"

import { getProviderEnvironment } from "@/lib/env"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { getStorageAdapter } from "@/lib/storage/factory"
import { getLocalDatabase } from "@/packages/provider-local/database"

async function main() {
  const database = getProviderEnvironment().persistenceProvider === "local" ? getLocalDatabase() : undefined
  let provider: Awaited<ReturnType<typeof getPersistenceProvider>> | undefined
  try {
    provider = await getPersistenceProvider()
    const storage = await getStorageAdapter()
    const [persistenceHealth, storageHealth] = await Promise.all([provider.health(), storage.health()])

    const report = {
      environment: getProviderEnvironment(),
      persistence: {
        kind: provider.kind,
        capabilities: provider.capabilities,
        health: { ok: persistenceHealth.ok, checkedAt: persistenceHealth.checkedAt },
      },
      storage: {
        kind: storage.kind,
        health: { ok: storageHealth.ok, checkedAt: storageHealth.checkedAt },
      },
    }

    console.log(JSON.stringify(report, null, 2))

    if (!persistenceHealth.ok || !storageHealth.ok) {
      process.exitCode = 1
    }
  } finally {
    try {
      if (provider && "close" in provider && typeof provider.close === "function") await provider.close()
    } finally {
      await database?.close()
    }
  }
}

main().catch(() => {
  console.error("Provider health check failed. Check the selected provider configuration and local PostgreSQL availability.")
  process.exitCode = 1
})
