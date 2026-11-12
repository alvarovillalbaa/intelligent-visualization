import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Pool } from "pg"
import { describe, expect, it } from "vitest"
import { createStarterCourseDocument, createStarterReportDocument } from "@/packages/domain/fixtures"
import type { RemoveWorkspaceDraftInput } from "@/packages/backend-contracts/workspace-removals"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { createPostgresDatabase, initializeLocalDatabase, upgradeLocalLifecycle } from "@/packages/provider-local/database"
import { seedLegacyRepository, withLegacyRepositoryState } from "@/packages/provider-local/legacy-state"
import { localMigrations, LOCAL_SCHEMA as S } from "@/packages/provider-local/schema"
import { checkPortableDatabase, exportPortableDatabase, importPortableDatabase, PORTABLE_COLUMNS, readPortableBackup } from "@/packages/provider-local/portable"
import { LIFECYCLE_CHILD_TABLES } from "@/packages/provider-postgres/lifecycle-v2"
import { createPostgresDatabase as nativeDatabase } from "@/packages/provider-postgres/database"
import { hostedLifecycleUpgradeSql } from "@/packages/provider-supabase/lifecycle-upgrade"
import { createSupabasePersistenceProviderForDatabase } from "@/packages/provider-supabase/adapter"
import { importPortableDatabase as importPostgresBackup } from "@/packages/provider-postgres/portable"
import { ensureSupabaseDatabase, SUPABASE_SCHEMA } from "@/packages/provider-supabase/schema"
import { withPostgresFixture, type createPostgresFixture } from "@/tests/providers/postgres-fixture"

type Fixture = Awaited<ReturnType<typeof createPostgresFixture>>
async function context(f: Fixture) {
  await seedLegacyRepository(f.database)
  const tokenHash = `removal-${randomUUID()}`
  const user = await withLegacyRepositoryState((state) => {
    const user = state.users[0]
    state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
    return { ...user }
  }, f.database)
  return { ...f, user, access: { tokenHash, workspaceSlug: "core-growth" }, removals: f.provider.workspaceRemovals }
}
type Context = Awaited<ReturnType<typeof context>>
function check(work: (value: Context) => Promise<unknown>) { return withPostgresFixture(async (f) => work(await context(f))) }
async function draft(v: Context, kind: "course" | "report" = "course") {
  return (await v.provider.workspaceDrafts.save(v.access, { id: randomUUID(), requestId: randomUUID(), expectedRevision: 0,
    document: kind === "course" ? createStarterCourseDocument() : createStarterReportDocument() })).draft
}
async function intent(v: Context, id: string): Promise<RemoveWorkspaceDraftInput> {
  const review = await v.removals.get(v.access, id)
  if (!review) throw new Error("Missing authored removal review")
  return { id, requestId: randomUUID(), expected: { draftRevision: review.draftRevision, draftHash: review.draftHash, status: review.status, publishedVersionId: review.publishedVersionId } }
}
async function role(v: Context, next: "viewer" | "editor") {
  await withLegacyRepositoryState((state) => {
    state.users.find((u) => u.id === v.user.id)!.role = next
    state.teams.find((t) => t.id === v.user.teamId)!.members.find((m) => m.userId === v.user.id)!.role = next
  }, v.database)
}
async function graph(v: Context, id: string) {
  const parent = (await v.database.query(`SELECT * FROM ${S}.visualizations WHERE id=$1`, [id])).rows[0]
  const ids = Object.fromEntries(LIFECYCLE_CHILD_TABLES.map((table) => [table, randomUUID()]))
  const rows: Record<string, Record<string, unknown>> = {}
  for (const table of LIFECYCLE_CHILD_TABLES) {
    const columns = PORTABLE_COLUMNS[table].split(" ")
    const values: Record<string, unknown> = { id: ids[table], visualization_id: id, public_id: parent.public_id,
      version_id: ids.visualization_versions, fallback_version_id: ids.visualization_versions, review_request_id: ids.review_requests,
      experiment_id: ids.experiments, variant_id: ids.experiment_variants, created_by: parent.created_by,
      document_json: JSON.stringify(parent.draft_document_json), document_hash: parent.draft_hash, schema_version: 1, revision: 1,
      weight: 100, size_bytes: 4, duration_ms: 2, parent_comment_id: null, applied_at: null, output_json: null, error: null,
      suggested_patch_json: null, artifact_url: null, password_hash: null, status: table === "visualization_versions" ? "published" : "draft" }
    const row = Object.fromEntries(columns.map((column) => [column, Object.hasOwn(values, column) ? values[column]
      : column.endsWith("_at") ? new Date().toISOString() : column.endsWith("_json") ? "[]" : `authored-${column}`]))
    await v.database.query(`INSERT INTO ${S}.${table} (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, columns.map((c) => row[c]))
    rows[table] = row
  }
  await v.database.query(`UPDATE ${S}.visualizations SET status='published', published_version_id=$2 WHERE id=$1`, [id, ids.visualization_versions])
  return { ids, rows }
}
async function retained(v: Context) {
  const result: Record<string, unknown> = {}
  for (const table of ["visualizations", ...LIFECYCLE_CHILD_TABLES]) result[table] = (await v.database.query(`SELECT * FROM ${S}.${table} ORDER BY id`)).rows
  return JSON.parse(JSON.stringify(result)) as Record<string, Array<Record<string, unknown>>>
}

describe("terminal workspace removal in PostgreSQL", () => {
  it.each(["course", "report"] as const)("removes %s atomically while retaining its complete graph and revision", (kind) => check(async (v) => {
    const d = await draft(v, kind); await graph(v, d.id); const before = await retained(v), request = await intent(v, d.id)
    const result = await v.removals.remove(v.access, request)
    expect(result).toMatchObject({ status: "removed", current: { id: d.id, ...request.expected, status: "removed" }, receipt: { requestId: request.requestId, status: "removed" } })
    expect(result.receipt.removedAt).toBeTruthy()
    const after = await retained(v)
    before.visualizations[0].status = "removed"; before.visualizations[0].updated_at = after.visualizations[0].updated_at
    before.visualization_versions[0].status = "revoked"; expect(after).toEqual(before)
    expect(await v.removals.remove(v.access, request)).toEqual(result)
    expect(await v.removals.get(v.access, d.id)).toBeNull(); expect(await v.provider.workspaceDrafts.get(v.access, d.id)).toBeNull()
    expect(await v.provider.visualizations.get(d.id)).toBeNull(); expect((await v.provider.workspaceDrafts.list(v.access)).items).toEqual([])
    expect(await v.provider.workspacePublications.get(v.access, d.id)).toBeNull()
  }))
  it("rechecks viewer and revoked authentication before returning even an accepted receipt", () => check(async (v) => {
    const d = await draft(v), request = await intent(v, d.id)
    await role(v, "viewer"); expect(await v.removals.get(v.access, d.id)).toBeTruthy()
    await expect(v.removals.remove(v.access, request)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await role(v, "editor"); await v.removals.remove(v.access, request); await role(v, "viewer")
    await expect(v.removals.remove(v.access, request)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await withLegacyRepositoryState((state) => { state.sessions = [] }, v.database)
    await expect(v.removals.remove(v.access, request)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  }))
  it("refuses cross-workspace access and changed request UUID bindings", () => check(async (v) => {
    const first = await draft(v), second = await draft(v), request = await intent(v, first.id), other = await intent(v, second.id)
    await v.removals.remove(v.access, request)
    await expect(v.removals.remove(v.access, { ...request, expected: { ...request.expected, draftHash: "b".repeat(64) } })).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(v.removals.remove(v.access, { ...other, requestId: request.requestId })).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(v.removals.remove({ ...v.access, workspaceSlug: "unowned" }, request)).rejects.toBeTruthy()
    expect(await v.provider.visualizations.get(second.id)).toBeTruthy()
  }))
  it.each(["draftRevision", "draftHash", "status", "publishedVersionId"] as const)("compares the reviewed %s and preserves an original conflict on retry", (field) => check(async (v) => {
    const d = await draft(v), request = await intent(v, d.id)
    const changed = { draftRevision: 2, draftHash: "b".repeat(64), status: "archived", publishedVersionId: randomUUID() }[field]
    const stale = { ...request, expected: { ...request.expected, [field]: changed } } as RemoveWorkspaceDraftInput
    const result = await v.removals.remove(v.access, stale); expect(result.status).toBe("conflict"); expect(result.receipt.removedAt).toBeNull()
    await v.removals.remove(v.access, { ...request, requestId: randomUUID() })
    const retry = await v.removals.remove(v.access, stale); expect(retry.status).toBe("conflict"); expect(retry.current.status).toBe("removed"); expect(retry.receipt).toEqual(result.receipt)
  }))
  it("serializes competing removals and refuses saves and prepared/final publication replay afterward", () => check(async (v) => {
    const d = await draft(v), request = await intent(v, d.id), second = createLocalPersistenceProvider({ connectionString: v.connectionString })
    const publish = { id: d.id, requestId: randomUUID(), versionId: randomUUID(), expectedRevision: d.draftRevision, expectedDraftHash: d.draftHash }
    expect((await v.provider.workspacePublications.prepare(v.access, publish)).status).toBe("ready")
    try {
      const pair = await Promise.all([v.removals.remove(v.access, request), second.workspaceRemovals.remove(v.access, { ...request, requestId: randomUUID() })])
      expect(pair.map((r) => r.status).sort()).toEqual(["conflict", "removed"])
      await expect(v.provider.workspaceDrafts.save(v.access, { id: d.id, requestId: randomUUID(), expectedRevision: 1, document: d.document })).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(v.provider.workspacePublications.prepare(v.access, publish)).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(v.provider.workspacePublications.unpublish(v.access, { id: d.id, requestId: randomUUID(), expectedCurrentVersionId: publish.versionId })).rejects.toMatchObject({ code: "NOT_FOUND" })
      await expect(v.provider.commands.saveVisualizationRevision({ visualizationId: d.id, expectedRevision: 1, document: d.document, idempotencyKey: randomUUID() })).rejects.toThrow()
    } finally { await second.close() }
  }))
  it("fences old generic cached results even when a new payload names another active target", () => check(async (v) => {
    const d = await draft(v), other = await draft(v), key = randomUUID()
    await v.provider.commands.saveVisualizationRevision({ visualizationId: d.id, expectedRevision: 1, document: d.document, idempotencyKey: key })
    await v.removals.remove(v.access, await intent(v, d.id))
    await expect(v.provider.commands.saveVisualizationRevision({ visualizationId: d.id, expectedRevision: 1, document: d.document, idempotencyKey: key })).rejects.toThrow()
    await expect(v.provider.commands.saveVisualizationRevision({ visualizationId: other.id, expectedRevision: 1, document: other.document, idempotencyKey: key })).rejects.toThrow()
  }))
  it("makes a direct SQL child write waiting on a removal observe the committed tombstone", () => check(async (v) => {
    const d = await draft(v), { ids } = await graph(v, d.id), request = await intent(v, d.id), writer = createPostgresDatabase(v.connectionString)
    let pending: Promise<unknown> | undefined
    try {
      const pid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid
      await v.database.transaction(async () => {
        expect((await v.removals.remove(v.access, request)).status).toBe("removed")
        pending = writer.query(`UPDATE ${S}.visualization_checkpoints SET title='racing overwrite' WHERE id=$1`, [ids.visualization_checkpoints])
        // Attach rejection handling before intentionally holding the other side.
        void pending.catch(() => {})
        let waiting = false
        for (let attempt = 0; attempt < 50; attempt++) {
          waiting = (await v.database.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted AND locktype='advisory') AS waiting", [pid])).rows[0].waiting === true
          if (waiting) break
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        expect(waiting).toBe(true)
      })
      await expect(pending).rejects.toMatchObject({ code: "55000" })
      expect((await v.database.query(`SELECT title FROM ${S}.visualization_checkpoints WHERE id=$1`, [ids.visualization_checkpoints])).rows[0].title).not.toBe("racing overwrite")
    } finally { await pending?.catch(() => {}); await writer.close() }
  }))
  it("protects every retained child from inserts updates deletes retargets and truncation", () => check(async (v) => {
    const d = await draft(v), first = await graph(v, d.id), other = await draft(v), active = await graph(v, other.id)
    await v.removals.remove(v.access, await intent(v, d.id)); const before = await retained(v)
    for (const table of LIFECYCLE_CHILD_TABLES) {
      const id = first.ids[table]
      await expect(v.database.query(`DELETE FROM ${S}.${table} WHERE id=$1`, [id])).rejects.toMatchObject({ code: "55000" })
      await expect(v.database.query(`UPDATE ${S}.${table} SET id=$2 WHERE id=$1`, [id, randomUUID()])).rejects.toMatchObject({ code: "55000" })
      const columns = PORTABLE_COLUMNS[table].split(" "), row = { ...first.rows[table], id: randomUUID() }
      await expect(v.database.query(`INSERT INTO ${S}.${table} (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, columns.map((c) => row[c as keyof typeof row]))).rejects.toMatchObject({ code: "55000" })
      const link = columns.includes("visualization_id") ? "visualization_id" : columns.includes("review_request_id") ? "review_request_id" : "experiment_id"
      await expect(v.database.query(`UPDATE ${S}.${table} SET ${link}=$2 WHERE id=$1`, [id, link === "visualization_id" ? other.id : link === "review_request_id" ? active.ids.review_requests : active.ids.experiments])).rejects.toMatchObject({ code: "55000" })
      await expect(v.database.query(`TRUNCATE ${S}.${table} CASCADE`)).rejects.toMatchObject({ code: "55000" })
    }
    for (const sql of [`DELETE FROM ${S}.visualizations WHERE id=$1`, `UPDATE ${S}.visualizations SET status='draft' WHERE id=$1`, `UPDATE ${S}.visualizations SET title='overwritten' WHERE id=$1`]) await expect(v.database.query(sql, [d.id])).rejects.toMatchObject({ code: "55000" })
    await expect(v.database.query(`DELETE FROM ${S}.workspaces WHERE id=(SELECT workspace_id FROM ${S}.visualizations WHERE id=$1)`, [d.id])).rejects.toMatchObject({ code: "55000" })
    expect(await retained(v)).toEqual(before)
  }))
  it("does not expose retained child records through private getters", () => check(async (v) => {
    const d = await draft(v), { ids } = await graph(v, d.id); await v.removals.remove(v.access, await intent(v, d.id))
    expect(await v.provider.versions.get(ids.visualization_versions)).toBeNull()
    expect(await v.provider.checkpoints.listByVisualization(d.id)).toEqual([])
    expect(await v.provider.sources.listByVisualization(d.id)).toEqual([])
    expect(await v.provider.assets.listByVisualization(d.id)).toEqual([])
    expect(await v.provider.reviews.get(ids.review_requests)).toBeNull()
    expect(await v.provider.reviews.listComments(ids.review_requests)).toEqual([])
    expect(await v.provider.experiments.get(ids.experiments)).toBeNull()
    expect(await v.provider.workflowRuns.get(ids.workflow_runs)).toBeNull()
  }))
  it("round-trips the full v2 tombstone graph without reopening existing records or inventing receipts", () => check(async (v) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "iv-removal-backup-")), backup = path.join(directory, "v2"), old = path.join(directory, "before")
    try {
      const d = await draft(v); await graph(v, d.id); const request = await intent(v, d.id)
      await exportPortableDatabase(v.database, old); await v.removals.remove(v.access, request); await exportPortableDatabase(v.database, backup)
      expect((await readPortableBackup(backup)).manifest.version).toBe(2)
      await importPortableDatabase(v.database, backup); await checkPortableDatabase(v.database, backup)
      await expect(importPortableDatabase(v.database, old)).rejects.toThrow("conflicts")
      await withPostgresFixture(async (target) => {
        await importPortableDatabase(target.database, backup); await checkPortableDatabase(target.database, backup)
        const restored = await context(target)
        const missingReceipt = await restored.removals.remove(restored.access, request)
        expect(missingReceipt).toMatchObject({ status: "conflict", current: { status: "removed" }, receipt: { status: "conflict", removedAt: null } })
      })
      const manifestPath = path.join(backup, "manifest.json"), manifest = JSON.parse(await readFile(manifestPath, "utf8"))
      await writeFile(manifestPath, JSON.stringify({ ...manifest, version: 1 })); await expect(readPortableBackup(backup)).rejects.toThrow("lifecycle")
    } finally { await rm(directory, { recursive: true }) }
  }))
  it("accepts a legitimate old v1 backup but refuses automatic upgrades of v1 databases", async () => {
    await withPostgresFixture(async (f) => {
      // A separate owned database has already been created; recreate only this
      // fixture's empty namespace to exercise the real immutable v1 migration.
      await f.database.query(`DROP SCHEMA ${S} CASCADE`)
      await f.database.query(`CREATE SCHEMA ${S}`)
      await f.database.query(`CREATE TABLE ${S}.schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL)`)
      for (const sql of localMigrations[0].statements) await f.database.query(sql)
      await f.database.query(`INSERT INTO ${S}.schema_migrations VALUES(1,$1,now())`, [localMigrations[0].name])
      const fresh = createPostgresDatabase(f.connectionString)
      try {
        await expect(initializeLocalDatabase(fresh)).rejects.toThrow("explicit upgrade"); await expect(upgradeLocalLifecycle(fresh, false)).rejects.toThrow()
        await expect(upgradeLocalLifecycle(fresh, true)).rejects.toThrow("other local")
        await f.provider.close(); await f.database.close()
        await upgradeLocalLifecycle(fresh, true)
        expect((await fresh.query(`SELECT version FROM ${S}.schema_migrations ORDER BY version`)).rows).toEqual([{ version: 1 }, { version: 2 }])
      }
      finally { await fresh.close() }
    })
    await check(async (v) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "iv-removal-v1-")), backup = path.join(root, "v1")
      try {
        await draft(v); await exportPortableDatabase(v.database, backup)
        const file = path.join(backup, "manifest.json"), manifest = JSON.parse(await readFile(file, "utf8")); await writeFile(file, JSON.stringify({ ...manifest, version: 1 }))
        expect((await readPortableBackup(backup)).manifest.version).toBe(1)
        await importPortableDatabase(v.database, backup)
      } finally { await rm(root, { recursive: true }) }
    })
  })
  it("validates exact v2 hosted functions and triggers under the restricted runtime role", async () => {
    const admin = new Pool({ connectionString: process.env.IV_POSTGRES_TEST_ADMIN_URL, max: 1 }), owned: Array<{ rolname: string; oid: string }> = []
    try {
      expect((await admin.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','iv_runtime')")).rows).toEqual([])
      for (const role of ["anon", "authenticated"]) {
        await admin.query(`CREATE ROLE ${role} NOLOGIN`)
        owned.push(...(await admin.query("SELECT rolname,oid::text AS oid FROM pg_roles WHERE rolname=$1", [role])).rows)
      }
      await withPostgresFixture(async (f) => {
        const source = await context(f), d = await draft(source); await graph(source, d.id)
        const backupRoot = await mkdtemp(path.join(os.tmpdir(), "iv-hosted-removal-")), backup = path.join(backupRoot, "portable")
        await exportPortableDatabase(f.database, backup)
        await f.database.query(await readFile(path.resolve("packages/provider-supabase/migration.sql.in"), "utf8"))
        owned.push(...(await admin.query("SELECT rolname,oid::text AS oid FROM pg_roles WHERE rolname='iv_runtime'")).rows)
        await f.database.query("ALTER ROLE iv_runtime LOGIN PASSWORD 'authored-runtime-only'")
        const ownerPool = new Pool({ connectionString: f.connectionString, max: 1 }), owner = await ownerPool.connect()
        try {
          await expect(owner.query(hostedLifecycleUpgradeSql())).rejects.toThrow("acknowledge retirement")
          await owner.query("ROLLBACK")
          await owner.query("SET iv.lifecycle_v2_retired='true'")
          await owner.query(hostedLifecycleUpgradeSql())
        } finally { owner.release(); await ownerPool.end() }
        const url = new URL(f.connectionString); url.username = "iv_runtime"; url.password = "authored-runtime-only"
        const runtime = nativeDatabase({ connectionString: url.toString(), max: 1, options: "-c search_path=pg_catalog" })
        try {
          await ensureSupabaseDatabase(runtime, true)
          await importPostgresBackup({ kind: "supabase", database: runtime, schema: SUPABASE_SCHEMA, ensure: () => ensureSupabaseDatabase(runtime) }, backup)
          const provider = createSupabasePersistenceProviderForDatabase(runtime)
          await provider.legacy.withState((state) => { state.sessions.push({ id: randomUUID(), userId: source.user.id, tokenHash: source.access.tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 60_000 }) })
          const request = await provider.workspaceRemovals.get(source.access, d.id)
          expect(request).toBeTruthy()
          const result = await provider.workspaceRemovals.remove(source.access, { id: d.id, requestId: randomUUID(), expected: { draftRevision: request!.draftRevision,
            draftHash: request!.draftHash, status: request!.status, publishedVersionId: request!.publishedVersionId } })
          expect(result.status).toBe("removed")
          await expect(runtime.query(`UPDATE ${SUPABASE_SCHEMA}.visualizations SET status='draft' WHERE id=$1`, [d.id])).rejects.toMatchObject({ code: "55000" })
          await expect(runtime.query(`DELETE FROM ${SUPABASE_SCHEMA}.visualization_versions WHERE visualization_id=$1`, [d.id])).rejects.toMatchObject({ code: "55000" })
          await f.database.query(`ALTER TABLE ${SUPABASE_SCHEMA}.visualizations DISABLE TRIGGER iv_removed_parent_v2`)
          await expect(ensureSupabaseDatabase(runtime, true)).rejects.toThrow("does not match")
        } finally { await runtime.close(); await rm(backupRoot, { recursive: true }) }
      })
    } finally {
      for (const row of owned) {
        expect((await admin.query("SELECT oid::text AS oid FROM pg_roles WHERE rolname=$1", [row.rolname])).rows[0]?.oid).toBe(row.oid)
        await admin.query(`DROP ROLE ${row.rolname}`)
      }
      await admin.end()
    }
  })
})
