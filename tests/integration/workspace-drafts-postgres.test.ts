import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { createLegacyOperations } from "@/lib/legacy-operations"
import type { RepositoryState, Role } from "@/lib/types"
import type { SaveWorkspaceDraftInput, WorkspaceDraftDocument } from "@/packages/backend-contracts/workspace-drafts"
import { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } from "@/packages/domain/fixtures"
import { contentHash } from "@/packages/domain/serialization"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { LEGACY_REPOSITORY_KEY, seedLegacyRepository, withLegacyRepositoryState } from "@/packages/provider-local/legacy-state"
import { LOCAL_SCHEMA } from "@/packages/provider-local/schema"
import { withPostgresFixture, type createPostgresFixture } from "@/tests/providers/postgres-fixture"

type Fixture = Awaited<ReturnType<typeof createPostgresFixture>>

async function prepare(fixture: Fixture) {
  await seedLegacyRepository(fixture.database)
  const tokenHash = `authored-workspace-session-${randomUUID()}`
  const owner = await withLegacyRepositoryState((state) => {
    const user = state.users[0]
    state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 300_000 })
    return { user, workspace: state.workspaces.find((workspace) => workspace.id === user.workspaceId)! }
  }, fixture.database)
  return { ...fixture, ...owner, access: { tokenHash, workspaceSlug: owner.workspace.slug }, store: fixture.provider.workspaceDrafts }
}

type Context = Awaited<ReturnType<typeof prepare>>

function check<T>(work: (context: Context) => Promise<T>) {
  return withPostgresFixture(async (fixture) => work(await prepare(fixture)))
}

function request(document: WorkspaceDraftDocument = createStarterCourseDocument(), id = randomUUID(), expectedRevision = 0): SaveWorkspaceDraftInput {
  return { id, requestId: randomUUID(), expectedRevision, document }
}

async function mutate(context: Context, work: (state: RepositoryState) => void) {
  await withLegacyRepositoryState(work, context.database)
}

async function setRole(context: Context, role: Role) {
  await mutate(context, (state) => {
    state.users.find((user) => user.id === context.user.id)!.role = role
    state.teams.find((team) => team.id === context.user.teamId)!.members.find((member) => member.userId === context.user.id)!.role = role
  })
}

async function canonicalCounts(context: Context) {
  const counts: Record<string, number> = {}
  for (const table of ["users", "sessions", "teams", "workspaces", "visualizations", "idempotency_records"]) {
    counts[table] = Number((await context.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.${table}`)).rows[0].count)
  }
  return counts
}

async function otherWorkspace(context: Context) {
  const slug = `other-${randomUUID()}`
  await mutate(context, (state) => {
    const workspace = { id: randomUUID(), teamId: context.user.teamId, slug, name: "Authored other workspace", description: "Private T3 fixture", decks: [] }
    state.workspaces.push(workspace)
    state.teams.find((team) => team.id === context.user.teamId)!.workspaces.push(workspace)
  })
  return { ...context.access, workspaceSlug: slug }
}

describe("durable workspace Course and Report drafts", () => {
  it("reads without provisioning canonical identity rows and rejects absent or expired sessions", async () => check(async (context) => {
    expect(await context.store.list(context.access)).toEqual({ items: [], nextCursor: null })
    expect(await context.store.get(context.access, randomUUID())).toBeNull()
    expect(await canonicalCounts(context)).toEqual({ users: 0, sessions: 0, teams: 0, workspaces: 0, visualizations: 0, idempotency_records: 0 })
    await expect(context.store.list({ ...context.access, tokenHash: "missing" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await mutate(context, (state) => { state.sessions[0].expiresAt = Date.now() - 1 })
    await expect(context.store.get(context.access, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  }))

  it("allows viewer reads while checking fresh editor membership before every write", async () => check(async (context) => {
    const input = request()
    await context.store.save(context.access, input)
    await setRole(context, "viewer")
    expect((await context.store.get(context.access, input.id))?.id).toBe(input.id)
    expect((await context.store.list(context.access)).items).toHaveLength(1)
    await expect(context.store.save(context.access, request(input.document, input.id, 1))).rejects.toMatchObject({ code: "FORBIDDEN" })
    await setRole(context, "editor")
    expect((await context.store.save(context.access, request({ ...input.document, title: "Editor changed" }, input.id, 1))).status).toBe("saved")
  }))

  it("maps explicit legacy identities without merging same-email canonical users or sessions", async () => check(async (context) => {
    const canonical = await context.provider.commands.registerUserWithTeam({ idempotencyKey: "authored-canonical-account",
      name: "Distinct canonical account", email: context.user.email, passwordHash: "distinct-authored-hash", teamName: "Distinct canonical team" })
    const saved = await context.store.save(context.access, request())
    const record = await context.provider.visualizations.get(saved.draft.id)
    expect(record).toMatchObject({ teamId: `legacy-team:${context.user.teamId}`, workspaceId: `legacy-workspace:${context.workspace.id}`,
      createdBy: `legacy-user:${context.user.id}` })
    expect(record?.teamId).not.toBe(canonical.team.id)
    expect(await context.provider.users.findByEmail(context.user.email)).toEqual(canonical.user)
    expect((await canonicalCounts(context)).users).toBe(1)
    expect((await canonicalCounts(context)).sessions).toBe(0)
    expect((await context.provider.memberships.listByUser(canonical.user.id))).toEqual([canonical.membership])
    await context.database.query(`UPDATE ${LOCAL_SCHEMA}.teams SET brand_json = brand_json - 'workspaceDraftBridge' WHERE id = $1`, [record!.teamId])
    const before = await canonicalCounts(context)
    await expect(context.store.list(context.access)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(context.store.get(context.access, saved.draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(context.store.save(context.access, request(saved.draft.document, saved.draft.id, 1))).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await canonicalCounts(context)).toEqual(before)
    expect((await context.provider.visualizations.get(saved.draft.id))?.draftRevision).toBe(1)
  }))

  it("creates Course and Report documents and reopens them after closing the original provider pool", async () => check(async (context) => {
    const documents = [createStarterCourseDocument(), createStarterReportDocument()]
    const saved = await Promise.all(documents.map((document) => context.store.save(context.access, request(document))))
    await context.provider.close()
    const reopened = createLocalPersistenceProvider({ connectionString: context.connectionString })
    try {
      for (const [index, result] of saved.entries()) {
        expect(await reopened.workspaceDrafts.get(context.access, result.draft.id)).toEqual(result.draft)
        expect(result.draft.document).toEqual(documents[index])
        expect(result.receipt.acceptedRevision).toBe(1)
      }
    } finally { await reopened.close() }
  }))

  it("updates both kinds with canonical hashes revisions titles and unchanged save identities", async () => check(async (context) => {
    for (const document of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const original = await context.store.save(context.access, request(document))
      const changed = { ...document, title: `Changed ${document.kind}`, summary: "Authored durable summary" }
      const saved = await context.store.save(context.access, request(changed, original.draft.id, 1))
      expect(saved).toMatchObject({ status: "saved", draft: { id: original.draft.id, title: changed.title, summary: changed.summary,
        draftRevision: 2, draftHash: contentHash(changed), document: changed }, receipt: { acceptedRevision: 2, documentHash: contentHash(changed) } })
      expect((await context.store.list(context.access)).items.find((item) => item.id === original.draft.id)?.draftRevision).toBe(2)
      const sameHashRequest = request(changed, original.draft.id, 2)
      const advanced = await context.store.save(context.access, sameHashRequest)
      expect(advanced).toMatchObject({ status: "saved", draft: { draftRevision: 3, draftHash: saved.draft.draftHash }, receipt: { acceptedRevision: 3 } })
      expect(await context.store.save(context.access, sameHashRequest)).toEqual(advanced)
    }
  }))

  it("returns current durable content for stale revisions without overwriting the saved document", async () => check(async (context) => {
    const original = await context.store.save(context.access, request())
    const changed = { ...original.draft.document, title: "Saved newer revision" }
    await context.store.save(context.access, request(changed, original.draft.id, 1))
    const stale = request({ ...original.draft.document, title: "Stale local revision" }, original.draft.id, 1)
    const result = await context.store.save(context.access, stale)
    expect(result).toMatchObject({ status: "conflict", draft: { document: changed, draftRevision: 2 },
      receipt: { status: "conflict", acceptedRevision: null, documentHash: contentHash(stale.document) } })
    expect(await context.store.get(context.access, original.draft.id)).toEqual(result.draft)
  }))

  it("allows exactly one concurrent revision save through independent provider pools", async () => check(async (context) => {
    const original = await context.store.save(context.access, request())
    const second = createLocalPersistenceProvider({ connectionString: context.connectionString })
    try {
      const outcomes = await Promise.all([context.store, second.workspaceDrafts].map((store, index) =>
        store.save(context.access, request({ ...original.draft.document, title: `Concurrent writer ${index}` }, original.draft.id, 1))))
      expect(outcomes.map((item) => item.status).sort()).toEqual(["conflict", "saved"])
      expect((await context.store.get(context.access, original.draft.id))?.draftRevision).toBe(2)
    } finally { await second.close() }
  }))

  it("commits one creation and one request receipt for simultaneous identical retries", async () => check(async (context) => {
    const input = request()
    const results = await Promise.all(Array.from({ length: 4 }, () => context.store.save(context.access, input)))
    expect(results).toEqual(Array.from({ length: 4 }, () => results[0]))
    expect(await canonicalCounts(context)).toMatchObject({ teams: 1, workspaces: 1, visualizations: 1, idempotency_records: 1 })
  }))

  it("reconciles a lost acknowledgement using its original receipt and freshly loaded current revision", async () => check(async (context) => {
    const input = request()
    const committed = await context.store.save(context.access, input)
    expect(await context.store.save(context.access, input)).toEqual(committed)
    const newer = await context.store.save(context.access, request({ ...input.document, title: "Another committed edit" }, input.id, 1))
    const replay = await context.store.save(context.access, input)
    expect(replay).toEqual({ status: "conflict", draft: newer.draft, receipt: committed.receipt })
    expect(replay.receipt.acceptedRevision).toBe(1)
    expect(replay.draft.draftRevision).toBe(2)
  }))

  it("rejects a reused request identity with changed normalized payload or expected revision", async () => check(async (context) => {
    const input = request()
    await context.store.save(context.access, input)
    for (const changed of [{ ...input, document: { ...input.document, title: "Different payload" } }, { ...input, expectedRevision: 1 },
      { ...input, document: createStarterReportDocument() }]) {
      await expect(context.store.save(context.access, changed)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
    expect((await context.store.get(context.access, input.id))?.draftRevision).toBe(1)
    expect((await canonicalCounts(context)).idempotency_records).toBe(1)
  }))

  it("denies a globally bound UUID from another workspace or team without revealing its document", async () => check(async (context) => {
    const input = request()
    await context.store.save(context.access, input)
    const workspaceAccess = await otherWorkspace(context)
    const outsider = await withLegacyRepositoryState((state) => {
      const user = createLegacyOperations(state).createUser({ name: "Authored outsider", email: "outside@example.test", passwordHash: "authored", teamName: "Other team" })
      const tokenHash = `outside-${randomUUID()}`
      state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 300_000 })
      return { tokenHash, workspaceSlug: "hq" }
    }, context.database)
    for (const access of [workspaceAccess, outsider]) {
      expect(await context.store.get(access, input.id)).toBeNull()
      expect((await context.store.list(access)).items).toEqual([])
      await expect(context.store.save(access, request(input.document, input.id, 1))).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
    await expect(context.store.list({ ...context.access, workspaceSlug: "missing" })).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect((await canonicalCounts(context)).visualizations).toBe(1)
    const collisionTeam = randomUUID()
    await context.database.query(`INSERT INTO ${LOCAL_SCHEMA}.teams (id, slug, name, brand_json, created_at, updated_at)
      VALUES ($1, $1, 'Authored reserved identity collision', '{}'::jsonb, now(), now())`, [collisionTeam])
    await context.database.query(`UPDATE ${LOCAL_SCHEMA}.workspaces SET team_id = $1 WHERE id = $2`, [collisionTeam, `legacy-workspace:${context.workspace.id}`])
    const before = await canonicalCounts(context)
    await expect(context.store.list(context.access)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(context.store.get(context.access, input.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(context.store.save(context.access, request(input.document, input.id, 1))).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await canonicalCounts(context)).toEqual(before)
    expect((await context.provider.visualizations.get(input.id))?.draftRevision).toBe(1)
  }))

  it("keeps visualization kinds immutable and excludes legacy Slides identities", async () => check(async (context) => {
    const saved = await context.store.save(context.access, request())
    await expect(context.store.save(context.access, request(createStarterReportDocument(), saved.draft.id, 1))).rejects.toMatchObject({ code: "NOT_FOUND" })
    await context.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET kind = 'slides' WHERE id = $1`, [saved.draft.id])
    expect(await context.store.get(context.access, saved.draft.id)).toBeNull()
    expect((await context.store.list(context.access)).items).toEqual([])
    await expect(context.store.save(context.access, request(saved.draft.document, saved.draft.id, 1))).rejects.toMatchObject({ code: "NOT_FOUND" })
  }))

  it("paginates tied microsecond timestamps by UUID while returning only private summaries", async () => check(async (context) => {
    const ids: string[] = []
    for (let index = 0; index < 5; index++) {
      const input = request(index % 2 ? createStarterReportDocument() : createStarterCourseDocument())
      await context.store.save(context.access, input)
      ids.push(input.id)
    }
    await context.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET updated_at = $1::timestamptz`, ["2026-11-06T00:00:00.123456Z"])
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page = await context.store.list(context.access, cursor, 2)
      for (const item of page.items) {
        expect(Object.keys(item).sort()).toEqual(["id", "kind", "title", "summary", "draftRevision", "draftHash", "createdAt", "updatedAt"].sort())
        seen.push(item.id)
      }
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(ids.sort().reverse())
    expect(new Set(seen).size).toBe(5)
  }))

  it("rejects malformed identities documents revisions and pagination without creating rows", async () => check(async (context) => {
    const input = request()
    const invalid = [{ ...input, id: "not-a-uuid" }, { ...input, requestId: "not-a-uuid" }, { ...input, expectedRevision: -1 },
      { ...input, expectedRevision: 1.5 }, { ...input, document: { ...input.document, schemaVersion: 99 } },
      { ...input, document: { ...input.document, title: "" } }, { ...input, document: createStarterSlidesDocument() }]
    for (const value of invalid) await expect(context.store.save(context.access, value as SaveWorkspaceDraftInput)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(context.store.get(context.access, "not-a-uuid")).rejects.toMatchObject({ code: "INVALID_INPUT" })
    for (const cursor of ["", "not-json", Buffer.from(JSON.stringify(["another-workspace", "2026-11-06T00:00:00.123456Z", randomUUID()])).toString("base64url")]) {
      await expect(context.store.list(context.access, cursor)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
    for (const limit of [0, 101, Number.NaN]) await expect(context.store.list(context.access, null, limit)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(await canonicalCounts(context)).toEqual({ users: 0, sessions: 0, teams: 0, workspaces: 0, visualizations: 0, idempotency_records: 0 })
  }))

  it("rolls back canonical mirrors documents and receipts if the locked legacy transaction cannot commit", async () => check(async (context) => {
    const input = request()
    const before = (await context.database.query(`SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = $1`, [LEGACY_REPOSITORY_KEY])).rows[0].payload
    await context.database.query(`CREATE FUNCTION ${LOCAL_SCHEMA}.reject_workspace_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'authored workspace commit rejection'; END; $$`)
    await context.database.query(`CREATE TRIGGER reject_workspace_commit BEFORE UPDATE ON ${LOCAL_SCHEMA}.legacy_repository_state FOR EACH ROW EXECUTE FUNCTION ${LOCAL_SCHEMA}.reject_workspace_commit()`)
    try {
      await expect(context.store.save(context.access, input)).rejects.toThrow("authored workspace commit rejection")
      expect(await canonicalCounts(context)).toEqual({ users: 0, sessions: 0, teams: 0, workspaces: 0, visualizations: 0, idempotency_records: 0 })
      expect((await context.database.query(`SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = $1`, [LEGACY_REPOSITORY_KEY])).rows[0].payload).toEqual(before)
    } finally {
      await context.database.query(`DROP TRIGGER reject_workspace_commit ON ${LOCAL_SCHEMA}.legacy_repository_state`)
      await context.database.query(`DROP FUNCTION ${LOCAL_SCHEMA}.reject_workspace_commit()`)
    }
    expect((await context.store.save(context.access, input)).receipt.acceptedRevision).toBe(1)
  }))

  it("reauthorizes acknowledged retries after session expiry membership revocation and sign-out", async () => check(async (context) => {
    const input = request()
    await context.store.save(context.access, input)
    await mutate(context, (state) => { state.sessions[0].expiresAt = Date.now() - 1 })
    await expect(context.store.save(context.access, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await mutate(context, (state) => {
      state.sessions[0].expiresAt = Date.now() + 300_000
      state.teams.find((team) => team.id === context.user.teamId)!.members = []
    })
    await expect(context.store.save(context.access, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await mutate(context, (state) => { state.sessions = [] })
    await expect(context.store.get(context.access, input.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    expect((await canonicalCounts(context)).idempotency_records).toBe(1)
  }))
})
