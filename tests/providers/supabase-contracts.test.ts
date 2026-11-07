// T3: actual restricted LOGIN against the disposable local Supabase Postgres.
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } from "@/packages/domain/fixtures"
import { createDomainId, createPublicId } from "@/packages/domain/ids"
import { createSupabaseFixture, withSupabaseFixture, readFixtureJson } from "./supabase-fixture"

import { createLookupHash, createSessionToken, hashSecret, verifySecret } from "@/lib/auth"
import { createLegacyOperations } from "@/lib/legacy-operations"
import { resolveLegacyFileAccess } from "@/lib/legacy-file-access"
import { setPersistenceProviderForTests } from "@/lib/persistence/factory"
import { repository } from "@/lib/repository"
import { createSeedState } from "@/lib/seed"
import { readPublishedArtifact, readStoredFile, writeStoredBuffer } from "@/lib/storage"
import { setStorageAdapterForTests } from "@/lib/storage/factory"
import { slugify } from "@/lib/utils"
import { readWorkspacePublication, stageWorkspacePublication } from "@/lib/artifacts/publication"
import { createPostgresDatabase } from "@/packages/provider-postgres/database"
import { checkPortableDatabase, exportPortableDatabase, importPortableDatabase } from "@/packages/provider-postgres/portable"
import { createSupabasePersistenceProviderForDatabase } from "@/packages/provider-supabase/adapter"
import { supabaseConnectionString } from "@/packages/provider-supabase/database"
import { SUPABASE_SCHEMA, SUPABASE_TABLES } from "@/packages/provider-supabase/schema"

const fixtures: Awaited<ReturnType<typeof createSupabaseFixture>>[] = []

async function createProvider() {
  const fixture = await createSupabaseFixture()
  fixtures.push(fixture)
  return fixture.provider
}

afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.dispose() })

describe("Supabase persistence provider shared contracts", () => {
  it("registers a user with a team idempotently", async () => {
    const provider = await createProvider()
    const command = {
      idempotencyKey: "register-demo",
      name: "Morgan",
      email: "morgan@example.com",
      passwordHash: "hash",
      teamName: "Northstar",
    }

    const first = await provider.commands.registerUserWithTeam(command)
    const second = await provider.commands.registerUserWithTeam(command)

    expect(first.status).toBe("created")
    expect(second.user.id).toBe(first.user.id)
    expect(await provider.users.findByEmail("morgan@example.com")).toMatchObject({ id: first.user.id })
  })

  it("creates visualizations, rejects stale revisions, and publishes atomically", async () => {
    const provider = await createProvider()
    const registration = await provider.commands.registerUserWithTeam({
      idempotencyKey: "register",
      name: "Morgan",
      email: "morgan@example.com",
      passwordHash: "hash",
      teamName: "Northstar",
    })
    const document = createStarterSlidesDocument()
    const visualization = await provider.visualizations.create({
      idempotencyKey: "create-viz",
      teamId: registration.team.id,
      workspaceId: registration.workspace.id,
      publicId: createPublicId("slides"),
      kind: "slides",
      slug: "demo",
      title: document.title,
      description: document.summary,
      document,
      createdBy: registration.user.id,
    })

    const saved = await provider.commands.saveVisualizationRevision({
      idempotencyKey: "save-viz",
      visualizationId: visualization.id,
      expectedRevision: visualization.draftRevision,
      document: { ...document, title: "Updated" },
    })
    expect(saved.status).toBe("saved")
    if (saved.status !== "saved") throw new Error("Expected saved result")

    const conflict = await provider.commands.saveVisualizationRevision({
      idempotencyKey: "stale-save",
      visualizationId: visualization.id,
      expectedRevision: visualization.draftRevision,
      document,
    })
    expect(conflict.status).toBe("conflict")

    const versionId = createDomainId()
    const compiled = await compileVisualizationArtifact(saved.visualization.draftDocument, {
      visualizationId: saved.visualization.id,
      versionId,
    })
    const published = await provider.commands.publishVisualizationVersion({
      idempotencyKey: "publish-viz",
      visualizationId: saved.visualization.id,
      expectedRevision: saved.visualization.draftRevision,
      versionId,
      label: "Published",
      artifactStorageKey: "published/demo/index.html",
      artifactUrl: "/published/demo",
      artifactHash: compiled.contentHash,
      manifest: compiled.manifest,
      createdBy: registration.user.id,
    })

    expect(published.status).toBe("published")
    if (published.status !== "published") throw new Error("Expected published result")
    expect(published.visualization.publishedVersionId).toBe(versionId)
    expect((await provider.versions.listByVisualization(visualization.id))).toHaveLength(1)
  })

  it("records analytics, leads, reviews, and sticky experiment exposures", async () => {
    const provider = await createProvider()
    const registration = await provider.commands.registerUserWithTeam({
      idempotencyKey: "register",
      name: "Morgan",
      email: "morgan@example.com",
      passwordHash: "hash",
      teamName: "Northstar",
    })
    const document = createStarterSlidesDocument()
    const visualization = await provider.visualizations.create({
      idempotencyKey: "create-viz",
      teamId: registration.team.id,
      workspaceId: registration.workspace.id,
      publicId: createPublicId("slides"),
      kind: "slides",
      slug: "demo",
      title: document.title,
      description: document.summary,
      document,
      createdBy: registration.user.id,
    })

    await provider.analytics.recordBatch([
      {
        id: createDomainId(),
        visualizationId: visualization.id,
        publicId: visualization.publicId,
        versionId: null,
        type: "view",
        nodeId: null,
        nodeKind: null,
        visitorId: "visitor-1",
        value: null,
        durationMs: null,
        createdAt: new Date().toISOString(),
      },
    ])
    expect(await provider.analytics.listByVisualization(visualization.id)).toHaveLength(1)

    await provider.leads.create({
      id: createDomainId(),
      visualizationId: visualization.id,
      publicId: visualization.publicId,
      versionId: null,
      visitorId: "visitor-1",
      fields: { email: "lead@example.com" },
      createdAt: new Date().toISOString(),
    })
    expect(await provider.leads.listByVisualization(visualization.id)).toHaveLength(1)

    const versionA = createDomainId()
    const versionB = createDomainId()
    const reviewed = await compileVisualizationArtifact(document, { visualizationId: visualization.id, versionId: versionA })
    expect((await provider.commands.publishVisualizationVersion({ idempotencyKey: "publish-reviewed", visualizationId: visualization.id,
      expectedRevision: visualization.draftRevision, versionId: versionA, label: "Reviewed", artifactStorageKey: "published/reviewed/index.html",
      artifactUrl: "/published/reviewed", artifactHash: reviewed.contentHash, manifest: reviewed.manifest, createdBy: registration.user.id })).status).toBe("published")
    const review = await provider.reviews.createRequest({ id: createDomainId(), visualizationId: visualization.id, versionId: versionA,
      tokenHash: createLookupHash("authored-review-token"), title: "Authored review", status: "open", createdAt: new Date().toISOString() })
    const comment = await provider.commands.appendReviewComment({ idempotencyKey: "review-comment", reviewRequestId: review.id,
      authorName: "Authored reviewer", body: "Keep this literal feedback.", anchor: { nodeKind: "visualization", nodeId: visualization.id } })
    expect((await provider.reviews.listComments(review.id)).map((row) => row.id)).toEqual([comment.id])
    await provider.experiments.create(
      {
        id: "experiment-1",
        visualizationId: visualization.id,
        name: "Test",
        question: "Which version works?",
        status: "draft",
        fallbackVersionId: versionA,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      [
        { id: "variant-a", experimentId: "experiment-1", label: "A", versionId: versionA, weight: 50 },
        { id: "variant-b", experimentId: "experiment-1", label: "B", versionId: versionB, weight: 50 },
      ],
    )
    await provider.commands.activateExperiment({ idempotencyKey: "activate", experimentId: "experiment-1" })
    const first = await provider.commands.recordExperimentExposure({
      idempotencyKey: "exposure-1",
      experimentId: "experiment-1",
      visitorId: "visitor-1",
    })
    const second = await provider.commands.recordExperimentExposure({
      idempotencyKey: "exposure-2",
      experimentId: "experiment-1",
      visitorId: "visitor-1",
    })
    expect(second).toEqual(first)
  })

  it("starts from an explicitly migrated empty private schema under an actual restricted runtime login", async () => withSupabaseFixture(async ({ database, provider }) => {
    expect(provider.kind).toBe("supabase")
    const role = (await database.query("SELECT current_user AS current, session_user AS session, current_database() AS database")).rows[0]
    expect(role).toEqual({ current: "iv_runtime", session: "iv_runtime", database: "postgres" })
    const tables = (await database.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename", [SUPABASE_SCHEMA])).rows
    expect(tables.map((row) => row.tablename)).toEqual([...SUPABASE_TABLES])
    const legacy = await provider.legacy.withState((state) => structuredClone(state))
    expect(Object.values(legacy).every((rows) => Array.isArray(rows) && rows.length === 0)).toBe(true)
    expect((await database.query(`SELECT count(*)::int AS n FROM ${SUPABASE_SCHEMA}.users`)).rows[0].n).toBe(0)
    for (const url of ["postgresql://iv_runtime:x@127.0.0.1:54322/postgres", "postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", "postgresql://iv_runtime:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=disable"]) expect(() => supabaseConnectionString(url)).toThrow()
  }))

  it("serializes independent registration and revision compare-and-swap attempts without duplicate committed rows", async () => withSupabaseFixture(async (fixture) => {
    const second = await createSupabaseFixture(false)
    try {
      const input = { idempotencyKey: "parallel-register", name: "Authored person", email: "parallel@authored.invalid", passwordHash: "authored-hash", teamName: "Authored team" }
      const results = await Promise.all([fixture.provider.commands.registerUserWithTeam(input), second.provider.commands.registerUserWithTeam(input)])
      expect(results[0].user.id).toBe(results[1].user.id)
      expect((await fixture.database.query(`SELECT count(*)::int AS n FROM ${SUPABASE_SCHEMA}.users`)).rows[0].n).toBe(1)
      const document = createStarterSlidesDocument(), registration = results[0]
      const visualization = await fixture.provider.visualizations.create({ idempotencyKey: "create-parallel", teamId: registration.team.id, workspaceId: registration.workspace.id,
        publicId: createPublicId("slides"), kind: "slides", slug: "parallel", title: document.title, description: document.summary, document, createdBy: registration.user.id })
      const outcomes = await Promise.all([fixture.provider, second.provider].map((provider, index) => provider.commands.saveVisualizationRevision({ idempotencyKey: "save-" + index,
        visualizationId: visualization.id, expectedRevision: visualization.draftRevision, document: { ...document, title: "Winner " + index } })))
      expect(outcomes.filter((row) => row.status === "saved")).toHaveLength(1)
      expect(outcomes.filter((row) => row.status === "conflict")).toHaveLength(1)
    } finally { await second.dispose() }
  }))

  it("rolls back nested work on the same connection while committing its independent outer change", async () => withSupabaseFixture(async ({ database, provider }) => {
    const registration = await provider.commands.registerUserWithTeam({ idempotencyKey: "transaction-register", name: "Before", email: "transaction@authored.invalid", passwordHash: "authored-hash", teamName: "Transaction" })
    await database.transaction(async (outer) => {
      const pid = (await outer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid
      await outer.query(`UPDATE ${SUPABASE_SCHEMA}.users SET name='Outer' WHERE id=$1`, [registration.user.id])
      await expect(database.transaction(async (inner) => {
        expect((await inner.query("SELECT pg_backend_pid() AS pid")).rows[0].pid).toBe(pid)
        await inner.query(`UPDATE ${SUPABASE_SCHEMA}.users SET name='Inner' WHERE id=$1`, [registration.user.id])
        throw new Error("Authored rollback")
      })).rejects.toThrow("Authored rollback")
    })
    expect((await provider.users.findByEmail("transaction@authored.invalid"))?.name).toBe("Outer")
    await expect(provider.legacy.withState(async (state) => {
      state.events.push({ id: randomUUID(), publicId: "authored-rollback", type: "view", visitorId: "authored-visitor", createdAt: Date.now() })
      await provider.commands.registerUserWithTeam({ idempotencyKey: "nested-legacy-register", name: "Rolled back", email: "rolled-back@authored.invalid", passwordHash: "authored-hash", teamName: "Rolled back team" })
      throw new Error("Authored legacy and canonical rollback")
    })).rejects.toThrow("Authored legacy and canonical rollback")
    expect((await provider.legacy.withState((state) => state.events.length))).toBe(0)
    expect(await provider.users.findByEmail("rolled-back@authored.invalid")).toBeNull()
  }))

  it("shares portable password sessions and fresh workspace membership with the same selected legacy database", async () => withSupabaseFixture(async ({ provider, database }) => {
    const passwordHash = hashSecret("authored-ci-only-password"), token = createSessionToken(), tokenHash = createLookupHash(token)
    const user = await provider.legacy.withState((state) => {
      const ops = createLegacyOperations(state), created = ops.createUser({ name: "Authored owner", email: "owner@authored.invalid", passwordHash, teamName: "Authored legacy team" })
      ops.createSession({ id: randomUUID(), userId: created.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600000 })
      return created
    })
    expect(verifySecret("authored-ci-only-password", user.passwordHash)).toBe(true)
    expect(verifySecret("wrong-authored-password", user.passwordHash)).toBe(false)
    expect((await provider.legacy.withState((state) => createLegacyOperations(state).getSessionUser(tokenHash)))?.id).toBe(user.id)
    const access = { tokenHash, workspaceSlug: "hq" }
    const saved = await provider.workspaceDrafts.save(access, { id: randomUUID(), requestId: randomUUID(), expectedRevision: 0, document: createStarterCourseDocument() })
    expect(saved.status).toBe("saved")
    const raw = (await database.query(`SELECT payload FROM ${SUPABASE_SCHEMA}.legacy_repository_state WHERE key='legacy-slides'`)).rows[0].payload as { sessions: Array<{ tokenHash: string }> }
    expect(raw.sessions[0].tokenHash).toBe(tokenHash); expect(raw.sessions[0].tokenHash).not.toBe(token)
    await provider.legacy.withState((state) => { state.teams[0].members = [] })
    await expect(provider.workspaceDrafts.get(access, saved.draft.id)).rejects.toThrow()
  }))

  it("compiles private Course and Report objects and revokes old public resolution without deleting retained bytes", async () => withSupabaseFixture(async ({ provider, storage, keys }) => {
    const tokenHash = createLookupHash("authored-canonical-session")
    await provider.legacy.withState((state) => {
      const ops = createLegacyOperations(state), user = ops.createUser({ name: "Author", email: "canonical@authored.invalid", passwordHash: hashSecret("authored-only"), teamName: "Canonical team" })
      ops.createSession({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600000 })
    })
    const access = { tokenHash, workspaceSlug: "hq" }
    for (const document of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const saved = await provider.workspaceDrafts.save(access, { id: randomUUID(), requestId: randomUUID(), expectedRevision: 0, document })
      const input = { id: saved.draft.id, requestId: randomUUID(), versionId: randomUUID(), expectedRevision: 1, expectedDraftHash: saved.draft.draftHash }
      const prepared = await provider.workspacePublications.prepare(access, input)
      if (prepared.status !== "ready") throw new Error("Actual canonical publication was not prepared")
      keys.add(prepared.artifactStorageKey)
      const artifact = await stageWorkspacePublication(storage, prepared)
      const committed = await provider.workspacePublications.commit(access, input, artifact)
      expect(committed.status).toBe("published")
      const publicId = prepared.binding.publicId, reference = await provider.workspacePublications.resolve(publicId, input.versionId)
      if (!reference) throw new Error("Actual committed publication is unavailable")
      const actual = await readWorkspacePublication(storage, reference), original = await storage.get({ key: artifact.storageKey })
      expect(actual.html).toContain(document.title); expect(original?.contentHash).toBe(artifact.storageHash)
      const revoked = await provider.workspacePublications.unpublish(access, { id: input.id, requestId: randomUUID(), expectedCurrentVersionId: input.versionId })
      expect(revoked.status).toBe("unpublished")
      expect(await provider.workspacePublications.resolve(publicId)).toBeNull(); expect(await provider.workspacePublications.resolve(publicId, input.versionId)).toBeNull()
      expect((await storage.get({ key: artifact.storageKey }))?.contentHash).toBe(original?.contentHash)
      const next = { ...input, requestId: randomUUID(), versionId: randomUUID() }, nextPrepared = await provider.workspacePublications.prepare(access, next)
      if (nextPrepared.status !== "ready") throw new Error("Republish was not prepared")
      keys.add(nextPrepared.artifactStorageKey)
      expect((await provider.workspacePublications.commit(access, next, await stageWorkspacePublication(storage, nextPrepared))).status).toBe("published")
      expect(await provider.workspacePublications.resolve(publicId, input.versionId)).toBeNull()
      expect((await provider.workspacePublications.resolve(publicId))?.versionId).toBe(next.versionId)
    }
  }))

  it("restores a real private portable backup into the empty hosted seed while preserving conflicts and excluding sessions", async () => withSupabaseFixture(async ({ provider, context, database, resetApplication }) => {
    const root = process.env.IV_SUPABASE_CHECK_ROOT
    if (!root || !path.isAbsolute(root)) throw new Error("Portable fixture requires its owned runner root")
    const parent = await fs.lstat(root)
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid?.()) throw new Error("Portable parent ownership differs")
    const directory = await fs.mkdtemp(path.join(root, "supabase-portable-")), identity = await fs.lstat(directory)
    let primary: unknown, cleanup: unknown
    try {
      const registration = await provider.commands.registerUserWithTeam({ idempotencyKey: "portable-register", name: "Private owner", email: "portable@authored.invalid", passwordHash: hashSecret("private-authored-password"), teamName: "Private team" })
      await provider.sessions.create({ id: randomUUID(), userId: registration.user.id, tokenHash: createLookupHash("authored-portable-session"), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString() })
      await provider.legacy.withState((state) => {
        const ops = createLegacyOperations(state), user = ops.createUser({ name: "Private legacy owner", email: "legacy-portable@authored.invalid", passwordHash: hashSecret("authored-legacy-password"), teamName: "Private legacy team" })
        ops.createSession({ id: randomUUID(), userId: user.id, tokenHash: createLookupHash("authored-legacy-portable-session"), createdAt: Date.now(), expiresAt: Date.now() + 600000 })
      })
      const backup = path.join(directory, "backup")
      await exportPortableDatabase(context, backup)
      await resetApplication()
      await importPortableDatabase(context, backup)
      expect((await provider.users.findByEmail("portable@authored.invalid"))?.id).toBe(registration.user.id)
      expect((await database.query(`SELECT count(*)::int AS n FROM ${SUPABASE_SCHEMA}.sessions`)).rows[0].n).toBe(0)
      expect(await provider.legacy.withState((state) => ({ users: state.users.length, sessions: state.sessions.length }))).toEqual({ users: 1, sessions: 0 })
      await checkPortableDatabase(context, backup)
      await database.query(`UPDATE ${SUPABASE_SCHEMA}.users SET name='Retained changed owner' WHERE id=$1`, [registration.user.id])
      await expect(importPortableDatabase(context, backup)).rejects.toThrow()
      expect((await provider.users.findByEmail("portable@authored.invalid"))?.name).toBe("Retained changed owner")
    } catch (error) { primary = error }
    try {
      const current = await fs.lstat(directory), currentParent = await fs.lstat(root)
      if (current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== identity.uid || currentParent.dev !== parent.dev || currentParent.ino !== parent.ino || currentParent.isSymbolicLink()) throw new Error("Portable cleanup ownership differs")
      await fs.rm(directory, { recursive: true }); await expect(fs.lstat(directory)).rejects.toMatchObject({ code: "ENOENT" })
    } catch (error) { cleanup = error }
    if (primary && cleanup) throw new AggregateError([primary, cleanup], "Portable restore and owned cleanup failed")
    if (primary) throw primary
    if (cleanup) throw cleanup
  }))

  it("rejects privileged and SET ROLE database injection rather than silently initializing or bypassing runtime policy", async () => withSupabaseFixture(async () => {
    const adminDatabase = createPostgresDatabase({ connectionString: process.env.IV_SUPABASE_ADMIN_URL, max: 1 })
    try {
      await expect(createSupabasePersistenceProviderForDatabase(adminDatabase).health()).rejects.toThrow()
      await adminDatabase.transaction(async (transaction) => {
        await transaction.query("SET LOCAL ROLE iv_runtime")
        await expect(createSupabasePersistenceProviderForDatabase(adminDatabase).health()).rejects.toThrow()
      })
    } finally { await adminDatabase.close() }
  }))

  it("denies browser database roles and actual anonymous Data API access to the private application namespace", async () => withSupabaseFixture(async ({ admin, request, anonKey }) => {
    const client = await admin.connect()
    try {
      for (const role of ["anon", "authenticated"]) {
        await client.query("BEGIN"); await client.query("SET LOCAL ROLE " + role)
        await expect(client.query(`SELECT payload FROM ${SUPABASE_SCHEMA}.legacy_repository_state`)).rejects.toMatchObject({ code: "42501" })
        await client.query("ROLLBACK")
      }
    } finally { client.release() }
    const response = await request("/rest/v1/legacy_repository_state?select=key", { headers: { apikey: anonKey, Authorization: "Bearer " + anonKey, "Accept-Profile": SUPABASE_SCHEMA } })
    expect([401, 403, 404, 406]).toContain(response.status)
    const body = await readFixtureJson(response)
    expect(typeof body.code).toBe("string")
  }))

  it("rejects an incoming runtime-role grant and recovers only after that owned grant is removed", async () => withSupabaseFixture(async ({ admin, provider }) => {
    const role = "iv_test_" + randomUUID().replaceAll("-", "")
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT`)
    try {
      await admin.query(`GRANT iv_runtime TO ${role}`)
      await expect(provider.health()).rejects.toThrow()
      await admin.query(`REVOKE iv_runtime FROM ${role}`)
      expect((await provider.health()).ok).toBe(true)
    } finally {
      await admin.query(`REVOKE iv_runtime FROM ${role}`)
      await admin.query(`DROP ROLE ${role}`)
    }
  }))

  it("routes legacy Slides originals uploads snapshots and published HTML through the selected database and actual private Storage", async () => withSupabaseFixture(async ({ provider, storage, keys, database }) => {
    setPersistenceProviderForTests(provider)
    setStorageAdapterForTests({ kind: "supabase", health: () => storage.health(), get: (input) => storage.get(input), exists: (input) => storage.exists(input),
      delete: (input) => storage.delete(input), getPublicUrl: (key) => storage.getPublicUrl(key), put: (input) => { keys.add(input.key); return storage.put(input) } })
    try {
      const tokenHash = createLookupHash("authored-legacy-storage-session")
      const user = await repository.createUser({ name: "Private Slides author", email: "legacy-storage@authored.invalid", passwordHash: hashSecret("authored-ci-only"), teamName: "Authored Slides team" })
      await repository.createSession({ userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600000 })
      const teamSlug = await provider.legacy.withState((state) => state.teams.find((team) => team.id === user.teamId)!.slug)
      const source = structuredClone(createSeedState().decks[0].source)
      source.title = "Authored hosted legacy Slides"
      const original = "Private authored source, never a public attachment."
      const deck = await repository.createDeckFromGeneration(user.id, user.workspaceId, { inputKind: "files", rawText: "", prompt: "Authored static fixture; no generation call", themeMode: "brand",
        files: [{ name: "authored-source.txt", content: original, type: "text/plain" }] }, source)
      const upload = await writeStoredBuffer({ namespace: ["uploads", teamSlug, deck.id], fileName: "authored-attachment.txt", content: Buffer.from("Public authored attachment"), contentType: "text/plain" })
      await repository.addAsset(user.id, deck.id, { kind: "document", title: "Authored attachment", description: "Explicit committed attachment", ...upload })
      const published = await repository.publishVersion(user.id, deck.id, source, "Authored public snapshot")
      const editor = await repository.getDeckEditor(user.id, deck.id)
      expect(editor?.deck.publishedVersionId).toBe(published.id)
      expect(published.publicAssets?.some((asset) => asset.storageKey === upload.storageKey)).toBe(true)
      const sourceKey = deck.assets.find((asset) => asset.storageKey?.includes("/sources/"))?.storageKey
      if (!sourceKey) throw new Error("Actual stored legacy source key missing")
      expect(sourceKey.startsWith(`uploads/${slugify(teamSlug)}/${slugify(deck.publicId)}/sources/`)).toBe(true)
      expect(upload.storageKey.startsWith(`uploads/${slugify(teamSlug)}/${slugify(deck.id)}/`)).toBe(true)
      expect(published.publicAssets?.some((asset) => asset.storageKey === sourceKey)).toBe(false)
      expect((await readStoredFile(sourceKey))?.toString()).toBe(original)
      const html = await readPublishedArtifact(deck.publicId, published.id)
      expect(html?.toString()).toContain(source.title)
      expect([...keys].some((key) => key.startsWith("legacy-slides/published/"))).toBe(true)
      expect([...keys].some((key) => key === "legacy-slides/" + upload.storageKey)).toBe(true)
      expect([...keys].some((key) => key === "legacy-slides/" + sourceKey)).toBe(true)
      expect(await provider.legacy.withState((state) => resolveLegacyFileAccess(state, sourceKey, null))).toBeNull()
      expect(await provider.legacy.withState((state) => resolveLegacyFileAccess(state, sourceKey, tokenHash))).toBe("private")
      expect(await provider.legacy.withState((state) => resolveLegacyFileAccess(state, upload.storageKey, null))).toBe("public")
      const raw = (await database.query(`SELECT payload FROM ${SUPABASE_SCHEMA}.legacy_repository_state WHERE key='legacy-slides'`)).rows[0].payload as { decks: Array<{ id: string }> }
      expect(raw.decks.some((row) => row.id === deck.id)).toBe(true)
    } finally { setStorageAdapterForTests(null); setPersistenceProviderForTests(null) }
  }))
})
