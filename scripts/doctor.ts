import { getProviderEnvironment } from "@/lib/env"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { getStorageAdapter } from "@/lib/storage/factory"

async function main() {
  const provider = await getPersistenceProvider()
  const storage = await getStorageAdapter()
  const [persistenceHealth, storageHealth] = await Promise.all([provider.health(), storage.health()])

  const report = {
    environment: getProviderEnvironment(),
    persistence: {
      kind: provider.kind,
      capabilities: provider.capabilities,
      health: persistenceHealth,
    },
    storage: {
      kind: storage.kind,
      health: storageHealth,
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (!persistenceHealth.ok || !storageHealth.ok) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
