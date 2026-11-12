// T3: marked PostgreSQL databases, authored artifact metadata, and an owned portable-backup directory.
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createLegacyOperations } from "@/lib/legacy-operations"
import type { RepositoryState, Role } from "@/lib/types"
import type { WorkspaceDraft, WorkspaceDraftDocument } from "@/packages/backend-contracts/workspace-drafts"
import type { PreparedWorkspacePublication, PublishWorkspaceDraftInput, UnpublishWorkspaceDraftInput, WorkspacePublicationArtifact } from "@/packages/backend-contracts/workspace-publications"
import { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } from "@/packages/domain/fixtures"
import { createPublicId } from "@/packages/domain/ids"
import { buildPublicationContentSecurityPolicy } from "@/packages/domain/publication-security"
import { contentHash } from "@/packages/domain/serialization"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { seedLegacyRepository, withLegacyRepositoryState } from "@/packages/provider-local/legacy-state"
import { checkPortableDatabase, exportPortableDatabase, importPortableDatabase, readPortableBackup } from "@/packages/provider-local/portable"
import { LOCAL_SCHEMA } from "@/packages/provider-local/schema"
import { withPostgresFixture, type createPostgresFixture } from "@/tests/providers/postgres-fixture"

type Fixture = Awaited<ReturnType<typeof createPostgresFixture>>
async function context(fixture: Fixture) {
  await seedLegacyRepository(fixture.database)
  const tokenHash = `authored-unpublication-${randomUUID()}`
  const owner = await withLegacyRepositoryState((state) => {
    const user = state.users[0], workspace = state.workspaces.find((item) => item.id === user.workspaceId)!
    state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
    return { user, workspace }
  }, fixture.database)
  return { ...fixture, ...owner, access: { tokenHash, workspaceSlug: owner.workspace.slug }, publications: fixture.provider.workspacePublications }
}
type Context = Awaited<ReturnType<typeof context>>
function check(work: (value: Context) => Promise<void>) { return withPostgresFixture(async (fixture) => work(await context(fixture))) }
async function mutate(value: Context, work: (state: RepositoryState) => void) { await withLegacyRepositoryState(work, value.database) }
async function role(value: Context, next: Role) {
  await mutate(value, (state) => {
    state.users.find((user) => user.id === value.user.id)!.role = next
    state.teams.find((team) => team.id === value.user.teamId)!.members.find((member) => member.userId === value.user.id)!.role = next
  })
}
async function draft(value: Context, document: WorkspaceDraftDocument = createStarterCourseDocument()) {
  return (await value.provider.workspaceDrafts.save(value.access, { id: randomUUID(), requestId: randomUUID(), expectedRevision: 0, document })).draft
}
function intent(source: WorkspaceDraft): PublishWorkspaceDraftInput {
  return { id: source.id, requestId: randomUUID(), versionId: randomUUID(), expectedRevision: source.draftRevision, expectedDraftHash: source.draftHash }
}
async function ready(value: Context, input: PublishWorkspaceDraftInput): Promise<PreparedWorkspacePublication> {
  const result = await value.publications.prepare(value.access, input)
  if (result.status !== "ready") throw new Error("Authored publication was not prepared")
  return result
}
function artifact(prepared: PreparedWorkspacePublication): WorkspacePublicationArtifact {
  const artifactHash = contentHash(["authored-compiler", prepared.binding.versionId]), storageHash = contentHash(["authored-storage", prepared.binding])
  return { storageKey: prepared.artifactStorageKey, storageHash, artifactHash, manifest: {
    visualizationId: prepared.binding.publicId, versionId: prepared.binding.versionId, kind: prepared.binding.kind, schemaVersion: 1,
    documentHash: prepared.binding.expectedDraftHash, artifactHash, createdAt: prepared.preparedAt,
    rendererVersion: `visualization-${prepared.binding.kind}-public-v1`, sourceHashes: prepared.document.sourceManifest.map((source) => source.contentHash),
    assetReferences: prepared.document.assetIds, runtimeFeatures: ["no-analytics", "no-external-js", ...(prepared.binding.kind === "course" ? ["local-course-progress"] : [])],
    publication: { formatVersion: 1, bindingHash: contentHash(prepared.binding), sourceRevision: prepared.binding.expectedRevision,
      rawHtmlHash: contentHash(["authored-html", prepared.binding.versionId]), sizeBytes: 256, storageHash, storageBytes: 2048,
      contentSecurityPolicy: buildPublicationContentSecurityPolicy([]) },
  } }
}
async function publish(value: Context, source: WorkspaceDraft) {
  const input = intent(source), prepared = await ready(value, input)
  const result = await value.publications.commit(value.access, input, artifact(prepared))
  if (result.status !== "published") throw new Error("Authored publication did not commit")
  return { input, prepared, result }
}
function revoke(published: Awaited<ReturnType<typeof publish>>): UnpublishWorkspaceDraftInput {
  return { id: published.input.id, requestId: randomUUID(), expectedCurrentVersionId: published.input.versionId }
}
async function versions(value: Context, id: string) {
  return (await value.database.query(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_versions WHERE visualization_id = $1 ORDER BY id`, [id])).rows
}
async function receipt(value: Context, requestId: string, publication = false) {
  return (await value.database.query(`SELECT result_json FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1`,
    [`${publication ? "workspacePublication" : "workspaceUnpublication"}:v1:${requestId}`])).rows[0]?.result_json
}
async function withoutOriginalStatus(value: Context, requestId: string) {
  await value.database.query(`UPDATE ${LOCAL_SCHEMA}.idempotency_records SET result_json = result_json - 'originalStatus' WHERE key = $1`, [`workspacePublication:v1:${requestId}`])
}
async function ownedDirectory(work: (root: string) => Promise<void>) {
  const supplied = process.env.IV_UNPUBLICATION_CHECK_ROOT
  if (supplied !== undefined && !path.isAbsolute(supplied)) throw new Error("Unpublication fixtures require an absolute owned root")
  const parent = supplied ?? await fs.realpath(os.tmpdir()), parentIdentity = await fs.lstat(parent)
  if (!parentIdentity.isDirectory() || parentIdentity.isSymbolicLink() || (supplied !== undefined && parentIdentity.uid !== process.getuid?.())) throw new Error("Unpublication fixture parent ownership is invalid")
  const root = await fs.mkdtemp(path.join(parent, "unpublication-portable-")), identity = await fs.lstat(root)
  let primary: unknown, cleanup: unknown
  try { await work(root) } catch (error) { primary = error }
  try {
    const currentParent = await fs.lstat(parent), current = await fs.lstat(root)
    if (currentParent.isSymbolicLink() || currentParent.dev !== parentIdentity.dev || currentParent.ino !== parentIdentity.ino || currentParent.uid !== parentIdentity.uid
      || !current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== identity.uid || path.dirname(root) !== parent) throw new Error("Unpublication fixture ownership changed; cleanup refused")
    await fs.rm(root, { recursive: true, force: false })
    await expect(fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" })
  } catch (error) { cleanup = error }
  if (primary && cleanup) throw new AggregateError([primary, cleanup], "Unpublication check and owned cleanup failed")
  if (primary) throw primary
  if (cleanup) throw cleanup
}

describe("canonical workspace Course and Report unpublication", () => {
  it("revokes both formats and every prior URL while preserving draft and immutable snapshot metadata", async () => check(async (value) => {
    for (const document of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const source = await draft(value, document), first = await publish(value, source), second = await publish(value, source)
      const before = await versions(value, source.id), input = revoke(second)
      const result = await value.publications.unpublish(value.access, input)
      expect(result).toMatchObject({ status: "unpublished", state: { current: null, draftRevision: 1, draftHash: source.draftHash },
        receipt: { requestId: input.requestId, expectedCurrentVersionId: second.input.versionId, status: "unpublished" } })
      expect(result.receipt.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
      expect(await versions(value, source.id)).toEqual(before.map((row) => ({ ...row, status: "revoked" })))
      expect(await value.provider.workspaceDrafts.get(value.access, source.id)).toMatchObject({ document, draftRevision: 1, draftHash: source.draftHash })
      expect(await value.provider.visualizations.get(source.id)).toMatchObject({ status: "draft", publishedVersionId: second.input.versionId, publicId: second.prepared.binding.publicId })
      for (const id of [undefined, first.input.versionId, second.input.versionId]) expect(await value.publications.resolve(second.prepared.binding.publicId, id)).toBeNull()
    }
  }))

  it("requires a new version on republish and never reopens revoked version URLs", async () => check(async (value) => {
    for (const document of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const source = await draft(value, document), first = await publish(value, source)
      await value.publications.unpublish(value.access, revoke(first))
      const next = await publish(value, source)
      expect(next.input.versionId).not.toBe(first.input.versionId)
      expect(next.prepared.binding.publicId).toBe(first.prepared.binding.publicId)
      expect((await value.publications.resolve(next.prepared.binding.publicId))?.versionId).toBe(next.input.versionId)
      expect(await value.publications.resolve(next.prepared.binding.publicId, first.input.versionId)).toBeNull()
      expect((await value.provider.versions.get(first.input.versionId))?.status).toBe("revoked")
    }
  }))

  it("rejects malformed unpublish identities without creating operation receipts", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first)
    for (const changed of [{ ...input, id: "invalid" }, { ...input, requestId: "" }, { ...input, expectedCurrentVersionId: "invalid" }]) {
      await expect(value.publications.unpublish(value.access, changed)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
    expect(await receipt(value, input.requestId)).toBeUndefined()
    expect((await value.publications.get(value.access, source.id))?.current?.versionId).toBe(first.input.versionId)
  }))

  it("allows viewer reads but reauthorizes the editor role before revocation and every replay", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first)
    await role(value, "viewer")
    expect((await value.publications.get(value.access, source.id))?.current?.versionId).toBe(first.input.versionId)
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await role(value, "editor")
    expect((await value.publications.unpublish(value.access, input)).status).toBe("unpublished")
    await role(value, "viewer")
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
  }))

  it("refuses missing expired and revoked sessions or membership even after an accepted operation", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first)
    await expect(value.publications.unpublish({ ...value.access, tokenHash: "missing" }, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await value.publications.unpublish(value.access, input)
    await mutate(value, (state) => { state.sessions.find((session) => session.tokenHash === value.access.tokenHash)!.expiresAt = Date.now() - 1 })
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await mutate(value, (state) => { state.sessions.find((session) => session.tokenHash === value.access.tokenHash)!.expiresAt = Date.now() + 600_000; state.teams.find((team) => team.id === value.user.teamId)!.members = [] })
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await mutate(value, (state) => { state.sessions = [] })
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  }))

  it("denies cross workspace team Slides and invalid canonical projection ownership", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first)
    await mutate(value, (state) => { state.workspaces.push({ id: randomUUID(), teamId: value.user.teamId, slug: "other", name: "Other", description: "Authored", decks: [] }) })
    const outsider = await withLegacyRepositoryState((state) => {
      const user = createLegacyOperations(state).createUser({ name: "Outside", email: "outside@authored.test", passwordHash: "authored", teamName: "Outside" }), tokenHash = randomUUID()
      state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
      return { tokenHash, workspaceSlug: "hq" }
    }, value.database)
    for (const access of [{ ...value.access, workspaceSlug: "other" }, outsider]) await expect(value.publications.unpublish(access, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET kind = 'slides' WHERE id = $1`, [source.id])
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET kind = 'course' WHERE id = $1`, [source.id])
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.teams SET brand_json = '{}'::jsonb WHERE id = $1`, [`legacy-team:${value.user.teamId}`])
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect((await value.provider.versions.get(first.input.versionId))?.status).toBe("published")
  }))

  it("binds a global unpublish request UUID to the original pointer target and actor", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first)
    await value.publications.unpublish(value.access, input)
    const other = await publish(value, await draft(value, createStarterReportDocument()))
    for (const changed of [{ ...input, expectedCurrentVersionId: randomUUID() }, { ...revoke(other), requestId: input.requestId }]) {
      await expect(value.publications.unpublish(value.access, changed)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
    const another = await withLegacyRepositoryState((state) => {
      const user = { ...value.user, id: randomUUID(), email: "another-editor@authored.test", role: "editor" as const }, tokenHash = randomUUID()
      state.users.push(user); state.teams.find((team) => team.id === user.teamId)!.members.push({ userId: user.id, name: user.name, email: user.email, role: user.role })
      state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
      return { tokenHash, workspaceSlug: value.workspace.slug }
    }, value.database)
    await expect(value.publications.unpublish(another, input)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect((await value.publications.resolve(other.prepared.binding.publicId))?.versionId).toBe(other.input.versionId)
  }))

  it("persists stale pointer conflicts without revoking the newer public version", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), newer = await publish(value, source), input = revoke(first)
    const result = await value.publications.unpublish(value.access, input)
    expect(result).toMatchObject({ status: "conflict", state: { current: { versionId: newer.input.versionId } }, receipt: { status: "conflict", revokedAt: null } })
    expect(await value.publications.unpublish(value.access, input)).toEqual(result)
    expect((await versions(value, source.id)).every((row) => row.status === "published")).toBe(true)
  }))

  it("replays a lost acknowledgement while preserving a newer private saved revision", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first)
    const original = await value.publications.unpublish(value.access, input)
    await value.provider.workspaceDrafts.save(value.access, { id: source.id, requestId: randomUUID(), expectedRevision: 1, document: { ...source.document, title: "Private changes retained" } })
    const replay = await value.publications.unpublish(value.access, input)
    expect(replay).toMatchObject({ status: "unpublished", state: { current: null, draftRevision: 2 }, receipt: original.receipt })
    expect((await value.provider.workspaceDrafts.get(value.access, source.id))?.title).toBe("Private changes retained")
  }))

  it("reconciles original unpublish receipts as conflict after a later publish and unpublish cycle", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first), original = await value.publications.unpublish(value.access, input)
    const second = await publish(value, source)
    expect(await value.publications.unpublish(value.access, input)).toMatchObject({ status: "conflict", state: { current: { versionId: second.input.versionId } }, receipt: original.receipt })
    await value.publications.unpublish(value.access, revoke(second))
    expect(await value.publications.unpublish(value.access, input)).toMatchObject({ status: "conflict", state: { current: null }, receipt: original.receipt })
    expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBe(second.input.versionId)
  }))

  it("commits one accepted receipt for identical concurrent retries through independent pools", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first), second = createLocalPersistenceProvider({ connectionString: value.connectionString })
    try {
      const results = await Promise.all([value.publications.unpublish(value.access, input), second.workspacePublications.unpublish(value.access, input)])
      expect(results[0]).toEqual(results[1]); expect(results[0].status).toBe("unpublished")
      expect((await value.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1`, [`workspaceUnpublication:v1:${input.requestId}`])).rows[0].count).toBe(1)
    } finally { await second.close() }
  }))

  it("accepts only one concurrent distinct intent for the same expected current pointer", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), second = createLocalPersistenceProvider({ connectionString: value.connectionString })
    try {
      const results = await Promise.all([value.publications.unpublish(value.access, revoke(first)), second.workspacePublications.unpublish(value.access, revoke(first))])
      expect(results.map((row) => row.status).sort()).toEqual(["conflict", "unpublished"])
      expect(results.filter((row) => row.receipt.revokedAt !== null)).toHaveLength(1)
    } finally { await second.close() }
  }))

  it("fences an already prepared publication when the same published pointer becomes a revoked draft", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = intent(source), prepared = await ready(value, input)
    expect(await receipt(value, input.requestId, true)).toMatchObject({ originalStatus: "published", originalPointer: first.input.versionId })
    await value.publications.unpublish(value.access, revoke(first))
    expect(await value.publications.commit(value.access, input, artifact(prepared))).toMatchObject({ status: "conflict", state: { current: null } })
    expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBe(first.input.versionId)
    expect(await value.provider.versions.get(input.versionId)).toBeNull()
  }))

  it("fences the initial null pointer prepare publish unpublish ABA without clearing its last UUID", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), prepared = await ready(value, input), winner = await publish(value, source)
    await value.publications.unpublish(value.access, revoke(winner))
    const result = await value.publications.prepare(value.access, input)
    expect(result).toMatchObject({ status: "conflict", state: { current: null } })
    expect(await value.publications.commit(value.access, input, artifact(prepared))).toEqual(result)
    expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBe(winner.input.versionId)
    expect(await value.publications.resolve(winner.prepared.binding.publicId, input.versionId)).toBeNull()
  }))

  it("fences a prepare on a retained revoked pointer after another complete publication cycle", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source)
    await value.publications.unpublish(value.access, revoke(first))
    const input = intent(source), prepared = await ready(value, input), next = await publish(value, source)
    expect(await receipt(value, input.requestId, true)).toMatchObject({ originalStatus: "draft", originalPointer: first.input.versionId })
    await value.publications.unpublish(value.access, revoke(next))
    expect((await value.publications.commit(value.access, input, artifact(prepared))).status).toBe("conflict")
    expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBe(next.input.versionId)
  }))

  it("finalizes preupgrade prepared receipts without original status as durable conflicts at either phase", async () => check(async (value) => {
    for (const phase of ["prepare", "commit"] as const) {
      const source = await draft(value), input = intent(source), prepared = await ready(value, input)
      await withoutOriginalStatus(value, input.requestId)
      const result = phase === "prepare" ? await value.publications.prepare(value.access, input) : await value.publications.commit(value.access, input, artifact(prepared))
      expect(result).toMatchObject({ status: "conflict", receipt: { status: "conflict" } })
      expect(await receipt(value, input.requestId, true)).toMatchObject({ phase: "final", receipt: { status: "conflict" } })
      expect((await value.publications.commit(value.access, input, artifact(prepared))).status).toBe("conflict")
      expect(await value.provider.versions.get(input.versionId)).toBeNull()
    }
  }))

  it("preserves preupgrade final publication receipts without reopening their revoked versions", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source)
    await withoutOriginalStatus(value, first.input.requestId)
    expect(await value.publications.prepare(value.access, first.input)).toEqual(first.result)
    await value.publications.unpublish(value.access, revoke(first))
    const replay = await value.publications.commit(value.access, first.input, artifact(first.prepared))
    expect(replay).toMatchObject({ status: "conflict", state: { current: null }, receipt: first.result.receipt })
    expect(await value.publications.resolve(first.prepared.binding.publicId, first.input.versionId)).toBeNull()
  }))

  it("refuses canonical and revoked generic rollbacks while preserving ordinary Slides rollback", async () => check(async (value) => {
    for (const document of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const source = await draft(value, document), first = await publish(value, source)
      await publish(value, source)
      await expect(value.provider.commands.rollbackPublishedVersion({ idempotencyKey: randomUUID(), visualizationId: source.id, versionId: first.input.versionId, expectedRevision: 1 })).rejects.toThrow(/explicit new publication/)
      await value.publications.unpublish(value.access, { id: source.id, requestId: randomUUID(), expectedCurrentVersionId: (await value.provider.visualizations.get(source.id))!.publishedVersionId! })
      await expect(value.provider.commands.rollbackPublishedVersion({ idempotencyKey: randomUUID(), visualizationId: source.id, versionId: first.input.versionId, expectedRevision: 1 })).rejects.toThrow(/Revoked/)
    }
    const document = createStarterSlidesDocument(), registration = await value.provider.commands.registerUserWithTeam({ idempotencyKey: randomUUID(), name: "Slides owner", email: "slides@authored.test", passwordHash: "authored", teamName: "Slides" })
    const source = await value.provider.visualizations.create({ idempotencyKey: randomUUID(), teamId: registration.team.id, workspaceId: registration.workspace.id,
      kind: "slides", publicId: createPublicId("slides"), slug: "slides", title: document.title, description: document.summary, document, createdBy: registration.user.id })
    const ids = [randomUUID(), randomUUID()]
    for (const versionId of ids) await value.provider.commands.publishVisualizationVersion({ idempotencyKey: randomUUID(), visualizationId: source.id, expectedRevision: 1,
      versionId, label: "Authored Slides", artifactStorageKey: `authored/${versionId}`, artifactUrl: `/authored/${versionId}`, artifactHash: contentHash(versionId), manifest: {}, createdBy: registration.user.id })
    expect((await value.provider.commands.rollbackPublishedVersion({ idempotencyKey: randomUUID(), visualizationId: source.id, versionId: ids[0], expectedRevision: 1 })).visualization.publishedVersionId).toBe(ids[0])
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET status = 'revoked' WHERE id = $1`, [ids[1]])
    await expect(value.provider.commands.rollbackPublishedVersion({ idempotencyKey: randomUUID(), visualizationId: source.id, versionId: ids[1], expectedRevision: 1 })).rejects.toThrow(/Revoked/)
  }))

  it("rejects corrupted revoked pointers and rolls back revocation pointer and receipt on transaction failure", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), input = revoke(first), before = await versions(value, source.id)
    for (const policy of [{ protected: true, hash: null }, { protected: false, hash: "authored-existing-policy" }]) {
      await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET password_protected = $2, password_hash = $3 WHERE id = $1`, [source.id, policy.protected, policy.hash])
      await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    }
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET password_protected = FALSE, password_hash = NULL WHERE id = $1`, [source.id])
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET password_hash = 'authored-version-policy' WHERE id = $1`, [first.input.versionId])
    await expect(value.publications.unpublish(value.access, input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET password_hash = NULL WHERE id = $1`, [first.input.versionId])
    expect(await receipt(value, input.requestId)).toBeUndefined()
    await value.database.query(`CREATE FUNCTION ${LOCAL_SCHEMA}.reject_unpublication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'authored unpublication transaction rejection'; END; $$`)
    await value.database.query(`CREATE TRIGGER reject_unpublication BEFORE UPDATE ON ${LOCAL_SCHEMA}.legacy_repository_state FOR EACH ROW EXECUTE FUNCTION ${LOCAL_SCHEMA}.reject_unpublication()`)
    try {
      await expect(value.publications.unpublish(value.access, input)).rejects.toThrow("authored unpublication transaction rejection")
      expect(await versions(value, source.id)).toEqual(before)
      expect(await receipt(value, input.requestId)).toBeUndefined()
      expect(await value.provider.visualizations.get(source.id)).toMatchObject({ status: "published", publishedVersionId: first.input.versionId })
    } finally {
      await value.database.query(`DROP TRIGGER reject_unpublication ON ${LOCAL_SCHEMA}.legacy_repository_state`)
      await value.database.query(`DROP FUNCTION ${LOCAL_SCHEMA}.reject_unpublication()`)
    }
    await value.publications.unpublish(value.access, input)
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET artifact_storage_key = 'foreign/object' WHERE id = $1`, [first.input.versionId])
    await expect(value.publications.prepare(value.access, intent(source))).rejects.toMatchObject({ code: "NOT_FOUND" })
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET artifact_storage_key = $2 WHERE id = $1`, [first.input.versionId, first.prepared.artifactStorageKey])
    await value.provider.commands.saveVisualizationRevision({ idempotencyKey: randomUUID(), visualizationId: source.id, expectedRevision: 1, document: source.document, status: "published" })
    await expect(value.publications.prepare(value.access, { ...intent(source), expectedRevision: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await value.publications.resolve(first.prepared.binding.publicId)).toBeNull()
  }))

  it("retains revoked eligibility through an actual portable export import without restoring sessions or receipts", async () => ownedDirectory(async (root) => {
    await check(async (value) => withPostgresFixture(async (destination) => {
      const source = await draft(value, createStarterReportDocument()), first = await publish(value, source), input = revoke(first)
      await value.publications.unpublish(value.access, input)
      const output = path.join(root, "backup"), counts = await exportPortableDatabase(value.database, output), backup = await readPortableBackup(output)
      expect(backup.entities.visualization_versions[0].status).toBe("revoked")
      expect(backup.entities.visualizations[0]).toMatchObject({ status: "draft", published_version_id: first.input.versionId })
      expect(await fs.readdir(path.join(output, "entities"))).not.toContain("idempotency_records.ndjson")
      expect(await fs.readdir(path.join(output, "entities"))).not.toContain("sessions.ndjson")
      expect(await importPortableDatabase(destination.database, output)).toEqual(counts)
      expect(await checkPortableDatabase(destination.database, output)).toEqual(counts)
      expect((await destination.provider.versions.get(first.input.versionId))?.status).toBe("revoked")
      expect((await destination.provider.visualizations.get(source.id))?.publishedVersionId).toBe(first.input.versionId)
      expect(await destination.provider.workspacePublications.resolve(first.prepared.binding.publicId)).toBeNull()
      expect(await destination.provider.workspacePublications.resolve(first.prepared.binding.publicId, first.input.versionId)).toBeNull()
      expect((await destination.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.idempotency_records`)).rows[0].count).toBe(0)
      const restored = (await destination.database.query(`SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = 'legacy-slides'`)).rows[0].payload as RepositoryState
      expect(restored.sessions).toEqual([])
      await expect(destination.provider.workspacePublications.unpublish(value.access, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
      const restoredAccess = { ...value.access, tokenHash: `authored-restored-${randomUUID()}` }
      await withLegacyRepositoryState((state) => { state.sessions.push({ id: randomUUID(), userId: value.user.id, tokenHash: restoredAccess.tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 }) }, destination.database)
      expect((await destination.provider.workspacePublications.unpublish(restoredAccess, input)).status).toBe("conflict")
      expect(await destination.provider.versions.get(first.input.versionId)).toEqual(await value.provider.versions.get(first.input.versionId))
      const next = await publish({ ...value, ...destination, access: restoredAccess, publications: destination.provider.workspacePublications }, source)
      expect((await destination.provider.workspacePublications.resolve(first.prepared.binding.publicId))?.versionId).toBe(next.input.versionId)
      expect(await destination.provider.workspacePublications.resolve(first.prepared.binding.publicId, first.input.versionId)).toBeNull()
    }))
  }))
})
