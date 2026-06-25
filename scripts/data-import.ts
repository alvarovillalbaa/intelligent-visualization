import { promises as fs } from "node:fs"
import path from "node:path"

import { createClient, type InArgs } from "@libsql/client"

import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"

const tableColumns: Record<string, string[]> = {
  users: ["id", "email", "name", "password_hash", "created_at", "updated_at"],
  teams: ["id", "slug", "name", "brand_json", "created_at", "updated_at"],
  team_memberships: ["team_id", "user_id", "role", "created_at"],
  invites: ["id", "team_id", "workspace_id", "email", "invited_name", "role", "token_hash", "status", "invited_by_user_id", "created_at", "accepted_at"],
  workspaces: ["id", "team_id", "slug", "name", "description", "created_at", "updated_at"],
  visualizations: ["id", "team_id", "workspace_id", "public_id", "kind", "slug", "title", "description", "status", "schema_version", "draft_document_json", "draft_hash", "draft_revision", "theme_mode", "created_by", "created_at", "updated_at", "published_version_id", "password_protected", "password_hash"],
  visualization_versions: ["id", "visualization_id", "label", "status", "schema_version", "document_json", "document_hash", "artifact_storage_key", "artifact_url", "artifact_hash", "manifest_json", "created_by", "created_at", "password_hash"],
  visualization_checkpoints: ["id", "visualization_id", "title", "summary", "prompt", "revision", "document_json", "document_hash", "created_by", "created_at"],
  visualization_sources: ["id", "visualization_id", "filename_or_url", "mime", "size_bytes", "storage_key", "extraction_state", "extracted_text", "structured_tables_json", "content_hash", "provenance", "warnings_json", "created_at"],
  visualization_assets: ["id", "visualization_id", "kind", "title", "description", "storage_key", "url", "content_type", "size_bytes", "content_hash", "created_at"],
  review_requests: ["id", "visualization_id", "version_id", "token_hash", "title", "status", "created_at"],
  review_comments: ["id", "review_request_id", "author_name", "body", "anchor_json", "status", "suggested_patch_json", "parent_comment_id", "created_at", "applied_at"],
  analytics_events: ["id", "visualization_id", "public_id", "version_id", "type", "node_id", "node_kind", "visitor_id", "value", "duration_ms", "created_at"],
  leads: ["id", "visualization_id", "public_id", "version_id", "visitor_id", "fields_json", "created_at"],
  experiments: ["id", "visualization_id", "name", "question", "status", "fallback_version_id", "created_at", "updated_at"],
  experiment_variants: ["id", "experiment_id", "label", "version_id", "weight"],
  experiment_exposures: ["id", "experiment_id", "visitor_id", "variant_id", "version_id", "created_at"],
  workflow_runs: ["id", "visualization_id", "kind", "status", "input_json", "output_json", "error", "created_at", "updated_at"],
}

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
  const input = getArg("--input")
  if (!input) throw new Error("Missing --input.")
  if (provider !== "local") throw new Error(`Import for provider "${provider}" is not implemented yet.`)

  const databasePath = process.env.LOCAL_DATABASE_PATH ?? ".data/intelligent-visualization.sqlite"
  const local = createLocalPersistenceProvider({ databasePath })
  await local.health()
  const client = createClient({ url: `file:${databasePath}` })
  const report: Record<string, number> = {}

  for (const [table, columns] of Object.entries(tableColumns)) {
    const file = path.join(input, "entities", `${table}.ndjson`)
    let body = ""
    try {
      body = await fs.readFile(file, "utf8")
    } catch {
      report[table] = 0
      continue
    }
    const rows = body.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
    for (const row of rows) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        args: columns.map((column) => row[column] ?? null) as InArgs,
      })
    }
    report[table] = rows.length
  }

  console.log(JSON.stringify({ ok: true, input, imported: report }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
