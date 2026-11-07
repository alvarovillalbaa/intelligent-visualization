import "./load-local-env"

import { importPortableDatabase } from "@/packages/provider-postgres/portable"
import { openPortableProvider } from "./portable-provider"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const input = getArg("--input")
  if (!input) throw new Error("Use --provider local|supabase --input <verified-backup-directory>.")
  const context = await openPortableProvider(provider)
  try {
    const imported = await importPortableDatabase(context, input)
    console.log(JSON.stringify({ ok: true, provider, imported, existingRowsOverwritten: false, sessionsRestored: false }, null, 2))
  } finally {
    await context.database.close()
  }
}

main().catch(() => {
  console.error("Portable import failed. Check backup integrity, selected provider configuration and conflicting rows. Import is transactional; existing user data is never overwritten.")
  process.exitCode = 1
})
