import { readPortableBackup } from "@/packages/provider-local/portable"

async function main() {
  const index = process.argv.indexOf("--input")
  const input = index >= 0 ? process.argv[index + 1] : undefined
  if (!input) throw new Error("A backup input is required.")
  const { manifest, entities } = await readPortableBackup(input)
  console.log(JSON.stringify({ ok: true, entityCounts: Object.fromEntries(Object.entries(entities).map(([table, rows]) => [table, rows.length])),
    sensitiveBackup: manifest.sensitiveBackup === true, objectsVerified: false, sessionsIncluded: false }, null, 2))
}
main().catch(() => {
  console.error("Database backup verification failed. Check its manifest, entity types, counts and checksums; no database was changed.")
  process.exitCode = 1
})
