import "./load-local-env"

import { checkPortableDatabase } from "@/packages/provider-postgres/portable"
import { openPortableProvider } from "./portable-provider"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const input = getArg("--input")
  if (!input) throw new Error("A verified --input backup is required for PostgreSQL parity checks.")
  const context = await openPortableProvider(provider)
  try {
    const entityCounts = await checkPortableDatabase(context, input)
    console.log(JSON.stringify({ ok: true, provider, checks: ["backup checksums", "entity counts and values"], entityCounts,
      sessionsCompared: false, objectsCompared: false, publicRoutesOrPermissionsChecked: false }, null, 2))
  } finally {
    await context.database.close()
  }
}

main().catch(() => {
  console.error("PostgreSQL cutover checks failed. Supply a verified backup and check the selected provider's configuration; routes, permissions and storage objects require separate checks.")
  process.exitCode = 1
})
