import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { createStarterReportDocument } from "@/packages/domain/fixtures"
import { createPublicId } from "@/packages/domain/ids"
import { seedLegacyRepository } from "@/packages/provider-local/legacy-state"
import {
  checkPortableDatabase,
  exportPortableDatabase,
  importPortableDatabase,
  readPortableBackup,
} from "@/packages/provider-local/portable"
import { LOCAL_SCHEMA } from "@/packages/provider-local/schema"
import { withPostgresFixture } from "./postgres-fixture"

type Fixture = Parameters<Parameters<typeof withPostgresFixture>[0]>[0]
const AUTHORED_HASH = "authored-private-password-hash"

async function withPrivateDirectory(work: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "iv-portable-"))
  await fs.chmod(root, 0o700)
  const identity = await fs.lstat(root)
  try {
    await work(root)
  } finally {
    const current = await fs.lstat(root)
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== identity.uid) throw new Error("Portable test directory ownership changed; cleanup refused.")
    await fs.rm(root, { recursive: true })
  }
}

async function register(fixture: Fixture, suffix = "source", ids: { userId?: string; teamId?: string; workspaceId?: string } = {}) {
  return fixture.provider.commands.registerUserWithTeam({
    idempotencyKey: `portable:${suffix}`, name: `Authored ${suffix}`, email: `${suffix}@authored.invalid`,
    passwordHash: AUTHORED_HASH, teamName: `Authored ${suffix} team`, ...ids,
  })
}

describe("private portable PostgreSQL backups", () => {
  it("restores v1 entities native JSON and timestamps while retaining private hashes and excluding all sessions", async () => {
    await withPrivateDirectory(async (root) => withPostgresFixture(async (source) => withPostgresFixture(async (destination) => {
      const owner = await register(source), document = createStarterReportDocument()
      const visualization = await source.provider.visualizations.create({
        idempotencyKey: "portable:report", teamId: owner.team.id, workspaceId: owner.workspace.id,
        publicId: createPublicId("report"), kind: "report", slug: "authored-report",
        title: document.title, description: document.summary, document, createdBy: owner.user.id,
      })
      await source.database.query(`UPDATE ${LOCAL_SCHEMA}.teams SET brand_json = $1::jsonb WHERE id = $2`, [JSON.stringify({ tags: ["warm, paper"], nested: { enabled: false } }), owner.team.id])
      await source.database.query(`INSERT INTO ${LOCAL_SCHEMA}.sessions (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)`, ["authored-session", owner.user.id, "authored-session-hash", "2030-01-01T00:00:00.000Z", "2026-11-06T00:00:00.000Z"])
      await seedLegacyRepository(source.database)
      await source.database.query(`UPDATE ${LOCAL_SCHEMA}.legacy_repository_state SET payload = jsonb_set(payload, '{sessions}', $1::jsonb) WHERE key = 'legacy-slides'`, [JSON.stringify([{ tokenHash: "authored-active-legacy-session" }])])
      const originalLegacy = (await source.database.query(`SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = 'legacy-slides'`)).rows[0].payload as Record<string, unknown>
      const output = path.join(root, "backup"), exported = await exportPortableDatabase(source.database, output)
      const backup = await readPortableBackup(output)
      expect(backup.manifest).toMatchObject({ format: "intelligent-visualization-portable", version: 1, includesSessions: false, containsAuthenticationHashes: true, sensitiveBackup: true, containsBearerLinks: true, objectCount: 0 })
      expect(backup.entities.users[0].password_hash).toBe(AUTHORED_HASH)
      expect(backup.entities.users[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
      expect(JSON.parse(String(backup.entities.teams[0].brand_json))).toEqual({ tags: ["warm, paper"], nested: { enabled: false } })
      const legacy = JSON.parse(String(backup.entities.legacy_repository_state[0].payload))
      expect(legacy).toEqual({ ...originalLegacy, sessions: [] })
      expect((await fs.readdir(path.join(output, "entities")))).not.toContain("sessions.ndjson")
      expect((await fs.readdir(path.join(output, "entities")))).not.toContain("idempotency_records.ndjson")
      expect(await importPortableDatabase(destination.database, output)).toEqual(exported)
      expect(await checkPortableDatabase(destination.database, output)).toEqual(exported)
      expect((await destination.provider.users.findByEmail("source@authored.invalid"))?.passwordHash).toBe(AUTHORED_HASH)
      expect((await destination.provider.visualizations.get(visualization.id))?.draftDocument).toEqual(document)
      expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.sessions`)).rows[0].count).toBe(0)
      expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.idempotency_records`)).rows[0].count).toBe(0)
      expect((await destination.database.query(`SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = 'legacy-slides'`)).rows[0].payload).toEqual({ ...originalLegacy, sessions: [] })
      const checksums = JSON.parse(await fs.readFile(path.join(output, "checksums.json"), "utf8")) as Record<string, string>
      for (const [relative, expected] of Object.entries(checksums)) expect(createHash("sha256").update(await fs.readFile(path.join(output, relative))).digest("hex")).toBe(expected)
    })))
  })

  it("rejects corrupt checksums before inserting any destination entity", async () => {
    await withPrivateDirectory(async (root) => withPostgresFixture(async (source) => withPostgresFixture(async (destination) => {
      await register(source)
      const output = path.join(root, "backup")
      await exportPortableDatabase(source.database, output)
      await fs.appendFile(path.join(output, "entities/users.ndjson"), "\n")
      await expect(importPortableDatabase(destination.database, output)).rejects.toThrow(/checksum/i)
      expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(0)
    })))
  })

  it("rolls back earlier inserts on a conflict and preserves unrelated destination records", async () => {
    await withPrivateDirectory(async (root) => withPostgresFixture(async (source) => withPostgresFixture(async (destination) => {
      await register(source, "incoming", { userId: "incoming-user", teamId: "shared-team", workspaceId: "incoming-workspace" })
      const retained = await register(destination, "retained", { userId: "retained-user", teamId: "shared-team", workspaceId: "retained-workspace" })
      const output = path.join(root, "backup")
      await exportPortableDatabase(source.database, output)
      await expect(importPortableDatabase(destination.database, output)).rejects.toThrow(/conflict/i)
      expect(await destination.provider.users.findByEmail("incoming@authored.invalid")).toBeNull()
      expect(await destination.provider.users.findByEmail("retained@authored.invalid")).toEqual(retained.user)
      expect((await destination.provider.teams.get(retained.team.id))?.name).toBe("Authored retained team")
      expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(1)
    })))
  })

  it("replays an identical import without replacing rows or deleting additional destination data", async () => {
    await withPrivateDirectory(async (root) => withPostgresFixture(async (source) => withPostgresFixture(async (destination) => {
      await register(source)
      const output = path.join(root, "backup"), counts = await exportPortableDatabase(source.database, output)
      expect(await importPortableDatabase(destination.database, output)).toEqual(counts)
      const before = await destination.provider.users.findByEmail("source@authored.invalid")
      const additional = await register(destination, "additional")
      expect(await importPortableDatabase(destination.database, output)).toEqual(counts)
      expect(await destination.provider.users.findByEmail("source@authored.invalid")).toEqual(before)
      expect(await destination.provider.users.findByEmail("additional@authored.invalid")).toEqual(additional.user)
      expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(2)
    })))
  })

  it("refuses an existing output directory and creates private backup files without changing its contents", async () => {
    await withPrivateDirectory(async (root) => withPostgresFixture(async (source) => {
      await register(source)
      const occupied = path.join(root, "occupied")
      await fs.mkdir(occupied, { mode: 0o700 }); await fs.writeFile(path.join(occupied, "keep"), "authored retained file", { mode: 0o600 })
      await expect(exportPortableDatabase(source.database, occupied)).rejects.toThrow()
      expect(await fs.readFile(path.join(occupied, "keep"), "utf8")).toBe("authored retained file")
      expect(await fs.readdir(occupied)).toEqual(["keep"])
      const output = path.join(root, "backup")
      await exportPortableDatabase(source.database, output)
      for (const directory of [output, path.join(output, "entities"), path.join(output, "objects")]) expect((await fs.stat(directory)).mode & 0o777).toBe(0o700)
      for (const relative of ["manifest.json", "checksums.json", ...(await fs.readdir(path.join(output, "entities"))).map((name) => `entities/${name}`)]) expect((await fs.stat(path.join(output, relative))).mode & 0o777).toBe(0o600)
    }))
  })

  it("rejects wrong counts and arbitrary entity or checksum paths before writes", async () => {
    await withPrivateDirectory(async (root) => withPostgresFixture(async (source) => withPostgresFixture(async (destination) => {
      const owner = await register(source), document = createStarterReportDocument()
      await source.provider.visualizations.create({ idempotencyKey: "portable:invalid-fixture", teamId: owner.team.id, workspaceId: owner.workspace.id,
        publicId: createPublicId("report"), kind: "report", slug: "validation-fixture", title: document.title,
        description: document.summary, document, createdBy: owner.user.id })
      await seedLegacyRepository(source.database)
      const output = path.join(root, "backup")
      await exportPortableDatabase(source.database, output)
      const manifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8"))
      const checksums = JSON.parse(await fs.readFile(path.join(output, "checksums.json"), "utf8"))
      const invalid = [
        { manifest: { ...manifest, entityCounts: { ...manifest.entityCounts, users: 2 } }, checksums },
        { manifest: { ...manifest, entityCounts: { ...manifest.entityCounts, sessions: 0 } }, checksums },
        { manifest, checksums: { ...checksums, "../outside": "0".repeat(64) } },
      ]
      for (const value of invalid) {
        await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(value.manifest))
        await fs.writeFile(path.join(output, "checksums.json"), JSON.stringify(value.checksums))
        await expect(importPortableDatabase(destination.database, output)).rejects.toThrow()
        expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(0)
      }
      const originals: Record<string, string> = Object.fromEntries(await Promise.all(["users", "visualizations", "legacy_repository_state"].map(async (table): Promise<[string, string]> => [table, await fs.readFile(path.join(output, "entities", `${table}.ndjson`), "utf8")])))
      const legacy = JSON.parse(JSON.parse(originals.legacy_repository_state.trim()).payload)
      const invalidValues: Array<[string, string, unknown]> = [
        ["users", "id", null], ["users", "id", 42], ["users", "name", true], ["users", "name", 42],
        ["users", "email", null], ["users", "created_at", null],
        ["visualizations", "schema_version", null], ["visualizations", "schema_version", "not-an-integer"],
        ["visualizations", "schema_version", "2147483648"], ["visualizations", "schema_version", Number.MAX_SAFE_INTEGER + 1],
        ["visualizations", "draft_revision", "1e2"],
        ["legacy_repository_state", "payload", JSON.stringify({ ...legacy, users: [1] })],
        ["legacy_repository_state", "payload", JSON.stringify({ ...legacy, invites: [null] })],
      ]
      for (const [table, column, value] of invalidValues) {
        for (const [name, bytes] of Object.entries(originals)) await fs.writeFile(path.join(output, "entities", `${name}.ndjson`), bytes)
        const rows = originals[table].trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
        rows[0][column] = value
        const body = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, relative = `entities/${table}.ndjson`
        await fs.writeFile(path.join(output, relative), body)
        await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest))
        await fs.writeFile(path.join(output, "checksums.json"), JSON.stringify({ ...checksums, [relative]: createHash("sha256").update(body).digest("hex") }))
        await expect(readPortableBackup(output)).rejects.toThrow()
        await expect(importPortableDatabase(destination.database, output)).rejects.toThrow()
        expect((await destination.database.query(`SELECT count(*)::INTEGER AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(0)
      }
    })))
  })
})
