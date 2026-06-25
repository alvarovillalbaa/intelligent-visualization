import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { createClient } from "@libsql/client"

const entityTables = [
  "users",
  "teams",
  "team_memberships",
  "invites",
  "workspaces",
  "visualizations",
  "visualization_versions",
  "visualization_checkpoints",
  "visualization_sources",
  "visualization_assets",
  "review_requests",
  "review_comments",
  "analytics_events",
  "leads",
  "experiments",
  "experiment_variants",
  "experiment_exposures",
  "workflow_runs",
]

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const output = getArg("--output")
  if (!output) throw new Error("Missing --output.")
  if (provider !== "local") throw new Error(`Export for provider "${provider}" is not implemented yet.`)

  const databasePath = process.env.LOCAL_DATABASE_PATH ?? ".data/intelligent-visualization.sqlite"
  const client = createClient({ url: `file:${databasePath}` })
  const entityDir = path.join(output, "entities")
  await fs.rm(output, { recursive: true, force: true })
  await fs.mkdir(entityDir, { recursive: true })
  await fs.mkdir(path.join(output, "objects"), { recursive: true })

  const checksums: Record<string, string> = {}
  const entityCounts: Record<string, number> = {}

  for (const table of entityTables) {
    const result = await client.execute(`SELECT * FROM ${table}`)
    const fileName = `${table}.ndjson`
    const body = result.rows.map((row) => JSON.stringify(row)).join("\n")
    const normalizedBody = body ? `${body}\n` : ""
    await fs.writeFile(path.join(entityDir, fileName), normalizedBody, "utf8")
    checksums[`entities/${fileName}`] = createHash("sha256").update(normalizedBody).digest("hex")
    entityCounts[table] = result.rows.length
  }

  const manifest = {
    format: "intelligent-visualization-portable",
    version: 1,
    sourceProvider: provider,
    createdAt: new Date().toISOString(),
    applicationVersion: "0.1.0",
    schemaVersions: { visualizationDocument: 1 },
    entityCounts,
    objectCount: 0,
    includesUsers: true,
    includesSessions: false,
    encryptedSecrets: false,
  }

  await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")
  await fs.writeFile(path.join(output, "checksums.json"), JSON.stringify(checksums, null, 2), "utf8")
  console.log(JSON.stringify({ ok: true, output, entityCounts }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
