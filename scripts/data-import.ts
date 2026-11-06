import "./load-local-env"

import { createPostgresDatabase } from "@/packages/provider-local/database"
import { importPortableDatabase } from "@/packages/provider-local/portable"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const input = getArg("--input")
  if (provider !== "local" || !input) throw new Error("Use --provider local --input <verified-backup-directory>.")
  const database = createPostgresDatabase()
  try {
    const imported = await importPortableDatabase(database, input)
    console.log(JSON.stringify({ ok: true, imported, existingRowsOverwritten: false, sessionsRestored: false }, null, 2))
  } finally {
    await database.close()
  }
}

main().catch(() => {
  console.error("Portable import failed. Check backup integrity, LOCAL_DATABASE_URL and conflicting existing rows. Import data is transactional; existing rows are never overwritten.")
  process.exitCode = 1
})
