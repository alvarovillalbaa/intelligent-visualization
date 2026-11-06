import "./load-local-env"

import path from "node:path"

import { createPostgresDatabase } from "@/packages/provider-local/database"
import { exportPortableDatabase } from "@/packages/provider-local/portable"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const output = getArg("--output")
  if (provider !== "local" || !output) throw new Error("Use --provider local --output <new-private-directory>.")
  const database = createPostgresDatabase()
  try {
    const entityCounts = await exportPortableDatabase(database, output)
    console.log(JSON.stringify({ ok: true, output: path.resolve(output), entityCounts,
      sensitiveBackup: true, containsAuthenticationHashes: true, includesSessions: false, objectCount: 0 }, null, 2))
  } finally {
    await database.close()
  }
}

main().catch(() => {
  console.error("Local PostgreSQL export failed. Check LOCAL_DATABASE_URL and use a new private output directory; an existing backup is never overwritten.")
  process.exitCode = 1
})
