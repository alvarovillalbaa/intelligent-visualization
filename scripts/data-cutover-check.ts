import "./load-local-env"

import { createPostgresDatabase } from "@/packages/provider-local/database"
import { checkPortableDatabase } from "@/packages/provider-local/portable"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const input = getArg("--input")
  if (provider !== "local" || !input) throw new Error("A verified --input backup is required for local PostgreSQL parity checks.")
  const database = createPostgresDatabase()
  try {
    const entityCounts = await checkPortableDatabase(database, input)
    console.log(JSON.stringify({ ok: true, provider: "local", checks: ["backup checksums", "entity counts and values"], entityCounts,
      sessionsCompared: false, objectsCompared: false, publicRoutesOrPermissionsChecked: false }, null, 2))
  } finally {
    await database.close()
  }
}

main().catch(() => {
  console.error("Local PostgreSQL cutover checks failed. Supply a verified backup and compare its entity data before changing providers; routes, permissions and storage objects require separate checks.")
  process.exitCode = 1
})
