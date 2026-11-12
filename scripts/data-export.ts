import "./load-local-env"

import path from "node:path"

import { exportPortableDatabase } from "@/packages/provider-postgres/portable"
import { openPortableProvider } from "./portable-provider"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const output = getArg("--output")
  if (!output) throw new Error("Use --provider local|supabase --output <new-private-directory>.")
  const context = await openPortableProvider(provider)
  try {
    const entityCounts = await exportPortableDatabase(context, output)
    console.log(JSON.stringify({ ok: true, provider, output: path.resolve(output), entityCounts,
      sensitiveBackup: true, containsAuthenticationHashes: true, includesSessions: false, objectCount: 0 }, null, 2))
  } finally {
    await context.database.close()
  }
}

main().catch(() => {
  console.error("PostgreSQL export failed. Check the selected provider's configuration and use a new private output directory; an existing backup is never overwritten.")
  process.exitCode = 1
})
