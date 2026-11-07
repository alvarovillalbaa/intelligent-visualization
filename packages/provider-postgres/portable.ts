import { createHash } from "node:crypto"
import { constants, promises as fs } from "node:fs"
import path from "node:path"

import { postgresSchema, type PostgresContext } from "./context"

export const PORTABLE_COLUMNS = {
  users: "id email name password_hash created_at updated_at",
  teams: "id slug name brand_json created_at updated_at",
  team_memberships: "team_id user_id role created_at",
  invites: "id team_id workspace_id email invited_name role token_hash status invited_by_user_id created_at accepted_at",
  workspaces: "id team_id slug name description created_at updated_at",
  visualizations: "id team_id workspace_id public_id kind slug title description status schema_version draft_document_json draft_hash draft_revision theme_mode created_by created_at updated_at published_version_id password_protected password_hash",
  visualization_versions: "id visualization_id label status schema_version document_json document_hash artifact_storage_key artifact_url artifact_hash manifest_json created_by created_at password_hash",
  visualization_checkpoints: "id visualization_id title summary prompt revision document_json document_hash created_by created_at",
  visualization_sources: "id visualization_id filename_or_url mime size_bytes storage_key extraction_state extracted_text structured_tables_json content_hash provenance warnings_json created_at",
  visualization_assets: "id visualization_id kind title description storage_key url content_type size_bytes content_hash created_at",
  review_requests: "id visualization_id version_id token_hash title status created_at",
  review_comments: "id review_request_id author_name body anchor_json status suggested_patch_json parent_comment_id created_at applied_at",
  analytics_events: "id visualization_id public_id version_id type node_id node_kind visitor_id value duration_ms created_at",
  leads: "id visualization_id public_id version_id visitor_id fields_json created_at",
  experiments: "id visualization_id name question status fallback_version_id created_at updated_at",
  experiment_variants: "id experiment_id label version_id weight",
  experiment_exposures: "id experiment_id visitor_id variant_id version_id created_at",
  workflow_runs: "id visualization_id kind status input_json output_json error created_at updated_at",
  legacy_repository_state: "key payload updated_at",
} as const
export type PortableTable = keyof typeof PORTABLE_COLUMNS
export const PORTABLE_TABLES = Object.keys(PORTABLE_COLUMNS) as PortableTable[]
type Row = Record<string, unknown>
type Entities = Record<PortableTable, Row[]>
const INTEGER_COLUMNS = new Set(["schema_version", "draft_revision", "revision", "size_bytes", "duration_ms", "weight"])
const NULLABLE_COLUMNS: Partial<Record<PortableTable, string[]>> = {
  invites: ["accepted_at"],
  visualizations: ["published_version_id", "password_hash"],
  visualization_versions: ["artifact_storage_key", "artifact_url", "artifact_hash", "password_hash"],
  visualization_sources: ["extracted_text"],
  visualization_assets: ["url"],
  review_comments: ["suggested_patch_json", "parent_comment_id", "applied_at"],
  analytics_events: ["visualization_id", "version_id", "node_id", "node_kind", "value", "duration_ms"],
  leads: ["visualization_id", "version_id", "visitor_id"],
  workflow_runs: ["visualization_id", "output_json", "error"],
}
const LEGACY_KEYS = ["users", "sessions", "teams", "workspaces", "decks", "events", "leads", "invites"]
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const columns = (table: PortableTable) => PORTABLE_COLUMNS[table].split(" ")
const primaryKey = (table: PortableTable) => table === "team_memberships" ? ["team_id", "user_id"] : [table === "legacy_repository_state" ? "key" : "id"]
const jsonColumn = (column: string) => column.endsWith("_json") || column === "payload"

function emptyLegacyState(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const state = value as Row
  return Object.keys(state).sort().join(",") === [...LEGACY_KEYS].sort().join(",")
    && LEGACY_KEYS.every((key) => Array.isArray(state[key]) && (state[key] as unknown[]).length === 0)
}

function stable(value: unknown): string {
  const ordered = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(ordered)
    : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)])) : entry
  const result = JSON.stringify(ordered(value))
  if (result === undefined) throw new Error("Invalid portable JSON value.")
  return result
}

function legacyPayload(value: unknown, importing: boolean): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid legacy backup state.")
  const state = value as Row
  if (Object.keys(state).sort().join(",") !== [...LEGACY_KEYS].sort().join(",") || LEGACY_KEYS.some((key) => !Array.isArray(state[key]))) throw new Error("Invalid legacy backup state.")
  if (LEGACY_KEYS.some((key) => (state[key] as unknown[]).some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry)))) throw new Error("Invalid legacy collection entry.")
  if (importing && (state.sessions as unknown[]).length) throw new Error("Portable backups must not restore active sessions.")
  return { ...state, sessions: [] }
}

function portableRow(table: PortableTable, source: Row, native: boolean): Row {
  if (!source || typeof source !== "object" || Array.isArray(source)
    || (!native && Object.keys(source).sort().join(",") !== columns(table).sort().join(","))) throw new Error("Invalid portable entity columns.")
  if (table === "legacy_repository_state" && source.key !== "legacy-slides") throw new Error("Unknown legacy state identity.")
  return Object.fromEntries(columns(table).map((column) => {
    let value = source[column]
    if (value === undefined) throw new Error("Missing portable entity column.")
    if (primaryKey(table).includes(column) && (typeof value !== "string" || value.length === 0)) throw new Error("Invalid portable entity identity.")
    if (value === null) {
      if (!NULLABLE_COLUMNS[table]?.includes(column)) throw new Error("A required portable entity column is null.")
      return [column, null]
    }
    if (value !== null && jsonColumn(column)) {
      value = !native && typeof value === "string" ? JSON.parse(value) : value
      if (value === null) {
        if (!NULLABLE_COLUMNS[table]?.includes(column)) throw new Error("A required portable JSON value is null.")
        return [column, null]
      }
      if (table === "legacy_repository_state") value = legacyPayload(value, !native)
      value = stable(value)
    } else if (value !== null && column.endsWith("_at")) {
      if (!(value instanceof Date) && typeof value !== "string") throw new Error("Invalid portable timestamp.")
      value = value instanceof Date ? value.toISOString() : new Date(value).toISOString()
    } else if (column === "password_protected") {
      if (![true, false, 0, 1].includes(value as boolean | number)) throw new Error("Invalid portable boolean.")
      value = value === true || value === 1 ? 1 : 0
    } else if (value !== null && INTEGER_COLUMNS.has(column)) {
      if (typeof value === "string" ? !/^-?\d+$/.test(value) : typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Invalid portable integer.")
      const integer = BigInt(value as string | number)
      const minimum = BigInt(column === "size_bytes" ? "-9223372036854775808" : column === "weight" ? "0" : "-2147483648")
      const maximum = BigInt(column === "size_bytes" ? "9223372036854775807" : column === "weight" ? "100" : "2147483647")
      if (integer < minimum || integer > maximum) throw new Error("Portable integer exceeds its native column bounds.")
      value = integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : integer.toString()
    } else if (typeof value !== "string" || value.includes("\u0000")) throw new Error("Invalid portable text value.")
    return [column, value]
  }))
}

async function directory(directoryPath: string) {
  const item = await fs.lstat(directoryPath)
  if (!item.isDirectory() || item.isSymbolicLink()) throw new Error("Expected a regular backup directory.")
}
async function readFile(file: string, maximum = 64 * 1024 * 1024) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size > maximum) throw new Error("Invalid or oversized backup file.")
    const bytes = await handle.readFile(), after = await handle.stat(), current = await fs.lstat(file)
    if (current.isSymbolicLink() || current.dev !== before.dev || current.ino !== before.ino
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length !== before.size) throw new Error("Backup file changed while reading.")
    return bytes
  } finally {
    await handle.close()
  }
}

export async function readPortableBackup(inputDirectory: string): Promise<{ manifest: Row; entities: Entities }> {
  const input = path.resolve(inputDirectory)
  await directory(input); await directory(path.join(input, "entities"))
  const manifest = JSON.parse((await readFile(path.join(input, "manifest.json"), 1048576)).toString()) as Row
  const checksums = JSON.parse((await readFile(path.join(input, "checksums.json"), 1048576)).toString()) as Record<string, unknown>
  if (manifest.format !== "intelligent-visualization-portable" || manifest.version !== 1 || manifest.includesSessions !== false || manifest.objectCount !== 0
    || !manifest.entityCounts || typeof manifest.entityCounts !== "object" || Array.isArray(manifest.entityCounts)
    || !checksums || typeof checksums !== "object" || Array.isArray(checksums)) throw new Error("Unsupported portable backup manifest.")
  const counts = manifest.entityCounts as Record<string, unknown>
  const selected = PORTABLE_TABLES.filter((table) => Object.hasOwn(counts, table))
  if (Object.keys(counts).some((table) => !PORTABLE_TABLES.includes(table as PortableTable)) || selected.length < PORTABLE_TABLES.length - 1
    || PORTABLE_TABLES.some((table) => table !== "legacy_repository_state" && !Object.hasOwn(counts, table))) throw new Error("Unexpected portable entity set.")
  const expectedPaths = selected.map((table) => `entities/${table}.ndjson`).sort()
  if (Object.keys(checksums).sort().join(",") !== expectedPaths.join(",")) throw new Error("Unexpected portable checksum paths.")
  const entities = Object.fromEntries(PORTABLE_TABLES.map((table) => [table, [] as Row[]])) as Entities
  let totalBytes = 0
  for (const table of selected) {
    const relative = `entities/${table}.ndjson`, expected = checksums[relative], bytes = await readFile(path.join(input, relative))
    totalBytes += bytes.length
    if (totalBytes > 256 * 1024 * 1024 || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected) || digest(bytes) !== expected) throw new Error("Portable backup checksum or size verification failed.")
    const text = bytes.toString("utf8")
    if (!Buffer.from(text).equals(bytes) || (text && !text.endsWith("\n"))) throw new Error("Invalid portable UTF-8 or NDJSON framing.")
    const rows = text ? text.slice(0, -1).split("\n").map((line) => portableRow(table, JSON.parse(line) as Row, false)) : []
    if (!Number.isSafeInteger(counts[table]) || counts[table] !== rows.length) throw new Error("Portable entity count mismatch.")
    const keys = rows.map((row) => stable(primaryKey(table).map((key) => row[key])))
    if (new Set(keys).size !== keys.length) throw new Error("Duplicate portable entity identity.")
    entities[table] = rows
  }
  return { manifest, entities }
}

async function snapshot(context: PostgresContext): Promise<Entities> {
  const database = context.database, SCHEMA = postgresSchema(context.schema)
  return database.transaction(async (transaction) => {
    await transaction.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const entities = {} as Entities
    for (const table of PORTABLE_TABLES) {
      const result = await transaction.query(`SELECT * FROM ${SCHEMA}.${table} ORDER BY ${primaryKey(table).join(", ")}`)
      entities[table] = result.rows.map((row) => portableRow(table, row, true))
    }
    return entities
  })
}

export async function exportPortableDatabase(context: PostgresContext, outputDirectory: string): Promise<Record<string, number>> {
  postgresSchema(context.schema)
  const output = path.resolve(outputDirectory)
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 })
  await fs.mkdir(output, { mode: 0o700 }) // Exclusive: never remove or overwrite a backup.
  await fs.chmod(output, 0o700)
  await context.ensure()
  const entities = await snapshot(context), checksums: Record<string, string> = {}, entityCounts: Record<string, number> = {}
  await fs.mkdir(path.join(output, "entities"), { mode: 0o700 }); await fs.mkdir(path.join(output, "objects"), { mode: 0o700 })
  let totalBytes = 0
  for (const table of PORTABLE_TABLES) {
    const body = entities[table].map((row) => JSON.stringify(row)).join("\n"), bytes = body ? `${body}\n` : ""
    const length = Buffer.byteLength(bytes)
    totalBytes += length
    if (length > 64 * 1024 * 1024 || totalBytes > 256 * 1024 * 1024) throw new Error("Portable backup exceeds its supported size bound.")
    const relative = `entities/${table}.ndjson`
    await fs.writeFile(path.join(output, relative), bytes, { flag: "wx", mode: 0o600 })
    checksums[relative] = digest(bytes); entityCounts[table] = entities[table].length
  }
  const manifest = { format: "intelligent-visualization-portable", version: 1, sourceProvider: context.kind, createdAt: new Date().toISOString(),
    applicationVersion: "0.1.0", schemaVersions: { visualizationDocument: 1 }, entityCounts, objectCount: 0,
    includesUsers: true, includesSessions: false, encryptedSecrets: false,
    containsAuthenticationHashes: true, containsBearerLinks: entities.legacy_repository_state.length > 0, sensitiveBackup: true }
  await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 })
  await fs.writeFile(path.join(output, "checksums.json"), JSON.stringify(checksums, null, 2), { flag: "wx", mode: 0o600 })
  return entityCounts
}

export async function importPortableDatabase(context: PostgresContext, inputDirectory: string): Promise<Record<string, number>> {
  const database = context.database, SCHEMA = postgresSchema(context.schema)
  const { entities } = await readPortableBackup(inputDirectory) // Integrity before any database work.
  await context.ensure()
  return database.transaction(async (transaction) => {
    const imported: Record<string, number> = {}
    for (const table of PORTABLE_TABLES) {
      const names = columns(table), keys = primaryKey(table)
      for (const row of entities[table]) {
        const args = names.map((name) => name === "password_protected" ? row[name] === 1 : row[name])
        const parameters = names.map((name, index) => `$${index + 1}${jsonColumn(name) ? "::jsonb" : ""}`)
        const result = await transaction.query(`INSERT INTO ${SCHEMA}.${table} (${names.join(", ")}) VALUES (${parameters.join(", ")}) ON CONFLICT (${keys.join(", ")}) DO NOTHING RETURNING ${keys.join(", ")}`, args)
        if (result.rowCount === 0) {
          const existing = await transaction.query(`SELECT * FROM ${SCHEMA}.${table} WHERE ${keys.map((key, index) => `${key} = $${index + 1}`).join(" AND ")} FOR UPDATE`, keys.map((key) => row[key]))
          if (existing.rows.length !== 1) throw new Error("Portable import conflicts with existing data; no existing row was overwritten.")
          if (stable(portableRow(table, existing.rows[0], true)) !== stable(row)) {
            // Only an explicit hosted restore may replace the migration's exact
            // empty seed. Inspect raw state so even active sessions prevent it.
            if (context.kind !== "supabase" || table !== "legacy_repository_state" || !emptyLegacyState(existing.rows[0].payload)) {
              throw new Error("Portable import conflicts with existing data; no existing row was overwritten.")
            }
            const replaced = await transaction.query(`UPDATE ${SCHEMA}.legacy_repository_state SET payload = $2::jsonb, updated_at = $3 WHERE key = $1`,
              [row.key, row.payload, row.updated_at])
            if (replaced.rowCount !== 1) throw new Error("Hosted empty repository restore could not be committed.")
          }
        }
      }
      imported[table] = entities[table].length
    }
    return imported
  })
}

export async function checkPortableDatabase(context: PostgresContext, inputDirectory: string): Promise<Record<string, number>> {
  postgresSchema(context.schema)
  const { entities } = await readPortableBackup(inputDirectory)
  await context.ensure()
  const current = await snapshot(context), counts: Record<string, number> = {}
  for (const table of PORTABLE_TABLES) {
    const sorted = (rows: Row[]) => rows.map(stable).sort()
    if (stable(sorted(current[table])) !== stable(sorted(entities[table]))) throw new Error("Portable cutover parity check failed.")
    counts[table] = current[table].length
  }
  return counts
}
