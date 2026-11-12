// T3: separately marked PostgreSQL databases and authored trusted metadata; no filesystem or compiler invocation.
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createLegacyOperations } from "@/lib/legacy-operations"
import type { RepositoryState, Role } from "@/lib/types"
import type { WorkspaceDraft, WorkspaceDraftDocument } from "@/packages/backend-contracts/workspace-drafts"
import { WorkspacePublicationArtifactError, type PreparedWorkspacePublication, type PublishWorkspaceDraftInput, type WorkspacePublicationArtifact } from "@/packages/backend-contracts/workspace-publications"
import { createStarterCourseDocument, createStarterReportDocument } from "@/packages/domain/fixtures"
import { buildPublicationContentSecurityPolicy } from "@/packages/domain/publication-security"
import { contentHash } from "@/packages/domain/serialization"
import { createLocalPersistenceProvider } from "@/packages/provider-local/adapter"
import { seedLegacyRepository, withLegacyRepositoryState } from "@/packages/provider-local/legacy-state"
import { LOCAL_SCHEMA } from "@/packages/provider-local/schema"
import { withPostgresFixture, type createPostgresFixture } from "@/tests/providers/postgres-fixture"

type Fixture = Awaited<ReturnType<typeof createPostgresFixture>>
async function context(fixture: Fixture) {
  await seedLegacyRepository(fixture.database)
  const tokenHash = `authored-publication-${randomUUID()}`
  const owner = await withLegacyRepositoryState((state) => {
    const user = state.users[0], workspace = state.workspaces.find((item) => item.id === user.workspaceId)!
    state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
    return { user, workspace }
  }, fixture.database)
  return { ...fixture, ...owner, access: { tokenHash, workspaceSlug: owner.workspace.slug }, publications: fixture.provider.workspacePublications }
}
type Context = Awaited<ReturnType<typeof context>>
function check<T>(work: (value: Context) => Promise<T>) { return withPostgresFixture(async (fixture) => work(await context(fixture))) }
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
function intent(value: WorkspaceDraft): PublishWorkspaceDraftInput {
  return { id: value.id, requestId: randomUUID(), versionId: randomUUID(), expectedRevision: value.draftRevision, expectedDraftHash: value.draftHash }
}
async function ready(value: Context, input: PublishWorkspaceDraftInput): Promise<PreparedWorkspacePublication> {
  const result = await value.publications.prepare(value.access, input)
  if (result.status !== "ready") throw new Error("Authored publication was not prepared")
  return result
}
function artifact(prepared: PreparedWorkspacePublication): WorkspacePublicationArtifact {
  const artifactHash = contentHash(["authored-compiler-digest", prepared.binding.versionId])
  const storageHash = contentHash(["authored-storage-digest", prepared.binding])
  return { storageKey: prepared.artifactStorageKey, storageHash, artifactHash,
    manifest: { visualizationId: prepared.binding.publicId, versionId: prepared.binding.versionId, kind: prepared.binding.kind,
      schemaVersion: 1, documentHash: prepared.binding.expectedDraftHash, artifactHash, createdAt: prepared.preparedAt,
      rendererVersion: `visualization-${prepared.binding.kind}-public-v1`, sourceHashes: prepared.document.sourceManifest.map((source) => source.contentHash),
      assetReferences: prepared.document.assetIds, runtimeFeatures: ["no-analytics", "no-external-js", ...(prepared.binding.kind === "course" ? ["local-course-progress"] : ["report-flow-fallback"])],
      publication: { formatVersion: 1, bindingHash: contentHash(prepared.binding), sourceRevision: prepared.binding.expectedRevision,
        rawHtmlHash: contentHash(["authored-raw-digest", prepared.binding.versionId]), sizeBytes: 256, storageHash, storageBytes: 2048,
        contentSecurityPolicy: buildPublicationContentSecurityPolicy([]) } } }
}
async function publish(value: Context, source: WorkspaceDraft) {
  const input = intent(source), prepared = await ready(value, input), stored = artifact(prepared)
  const result = await value.publications.commit(value.access, input, stored)
  if (result.status !== "published") throw new Error("Authored publication did not commit")
  return { input, prepared, artifact: stored, result }
}
async function versionCount(value: Context) { return (await value.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.visualization_versions`)).rows[0].count }
async function receipt(value: Context, input: PublishWorkspaceDraftInput) {
  return (await value.database.query(`SELECT result_json FROM ${LOCAL_SCHEMA}.idempotency_records WHERE key = $1`, [`workspacePublication:v1:${input.requestId}`])).rows[0]?.result_json
}

describe("canonical workspace Course and Report publication", () => {
  it("keeps empty reads nonprovisioning and rejects missing or expired authentication", async () => check(async (value) => {
    expect(await value.publications.get(value.access, randomUUID())).toBeNull()
    expect((await value.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.teams`)).rows[0].count).toBe(0)
    await expect(value.publications.get({ ...value.access, tokenHash: "missing" }, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await mutate(value, (state) => { state.sessions[0].expiresAt = Date.now() - 1 })
    await expect(value.publications.prepare(value.access, { id: randomUUID(), requestId: randomUUID(), versionId: randomUUID(), expectedRevision: 1, expectedDraftHash: "a".repeat(64) }))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    expect(await versionCount(value)).toBe(0)
  }))

  it("allows viewer publication-state reads but requires the fresh editor role at both phases", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source)
    const next = intent(source), prepared = await ready(value, next)
    await role(value, "viewer")
    expect((await value.publications.get(value.access, source.id))?.current).toEqual(first.result.receipt.publication)
    await expect(value.publications.prepare(value.access, intent(source))).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(value.publications.commit(value.access, next, artifact(prepared))).rejects.toMatchObject({ code: "FORBIDDEN" })
    await role(value, "editor")
    expect((await value.publications.commit(value.access, next, artifact(prepared))).status).toBe("published")
  }))

  it("prepares both formats with stable server binding timestamp and object identity without exposing a version", async () => check(async (value) => {
    for (const document of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const source = await draft(value, document), input = intent(source), prepared = await ready(value, input)
      expect(prepared.document).toEqual(document)
      expect(prepared.binding).toMatchObject({ actorId: `legacy-user:${value.user.id}`, teamId: `legacy-team:${value.user.teamId}`,
        workspaceId: `legacy-workspace:${value.workspace.id}`, visualizationId: source.id, requestId: input.requestId, versionId: input.versionId,
        kind: source.kind, expectedRevision: 1, expectedDraftHash: source.draftHash })
      expect(prepared.artifactStorageKey).toBe(`canonical-publications/${source.id}/${input.versionId}/${contentHash(prepared.binding)}.json`)
      expect(await value.publications.prepare(value.access, input)).toEqual(prepared)
      expect(await value.publications.resolve(prepared.binding.publicId, input.versionId)).toBeNull()
      expect(await receipt(value, input)).toMatchObject({ phase: "prepared", originalPointer: null, preparedAt: prepared.preparedAt })
    }
    expect(await versionCount(value)).toBe(0)
  }))

  it("commits both formats as immutable snapshots with the bound actor version pointer and manifest", async () => check(async (value) => {
    for (const original of [createStarterCourseDocument(), createStarterReportDocument()]) {
      const document = original.kind === "course" ? { ...original, title: "😀".repeat(1005) + " preserved full title" } : original
      const source = await draft(value, document), published = await publish(value, source)
      const stored = (await value.database.query(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_versions WHERE id = $1`, [published.input.versionId])).rows[0]
      expect(stored).toMatchObject({ visualization_id: source.id, document_json: document, document_hash: source.draftHash,
        created_by: `legacy-user:${value.user.id}`, artifact_storage_key: published.artifact.storageKey, manifest_json: published.artifact.manifest, password_hash: null })
      expect(published.result).toMatchObject({ status: "published", state: { draftRevision: 1, draftHash: source.draftHash,
        current: { versionId: published.input.versionId, sourceRevision: 1, title: document.kind === "course" ? "😀".repeat(1000) + "…" : source.title } },
        receipt: { status: "published", acceptedRevision: 1, documentHash: source.draftHash } })
      expect((await value.provider.versions.get(published.input.versionId))?.document.title).toBe(document.title)
      expect(Array.from(published.result.receipt.publication!.title).length).toBeLessThanOrEqual(1001)
      expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBe(published.input.versionId)
      expect(await value.publications.resolve(published.prepared.binding.publicId)).toMatchObject({ storageHash: published.artifact.storageHash, artifactHash: published.artifact.artifactHash })
    }
    expect((await value.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.users`)).rows[0].count).toBe(0)
    expect((await value.database.query(`SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.sessions`)).rows[0].count).toBe(0)
  }))

  it("persists a stale preparation conflict and replays its original receipt with current state", async () => check(async (value) => {
    const source = await draft(value), input = { ...intent(source), expectedDraftHash: "f".repeat(64) }
    const conflict = await value.publications.prepare(value.access, input)
    expect(conflict).toMatchObject({ status: "conflict", state: { draftRevision: 1, draftHash: source.draftHash },
      receipt: { status: "conflict", acceptedRevision: null, documentHash: input.expectedDraftHash, publication: null } })
    await value.provider.workspaceDrafts.save(value.access, { id: source.id, requestId: randomUUID(), expectedRevision: 1, document: { ...source.document, title: "Newer draft" } })
    const replay = await value.publications.prepare(value.access, input)
    expect(replay).toMatchObject({ status: "conflict", state: { draftRevision: 2 }, receipt: "receipt" in conflict ? conflict.receipt : null })
    expect(await receipt(value, input)).toMatchObject({ phase: "final" })
    expect(await versionCount(value)).toBe(0)
  }))

  it("rejects malformed intents and commits without a prepared receipt without creating versions", async () => check(async (value) => {
    const source = await draft(value), input = intent(source)
    for (const invalid of [{ ...input, id: "invalid" }, { ...input, requestId: "invalid" }, { ...input, versionId: "invalid" },
      { ...input, expectedRevision: 0 }, { ...input, expectedRevision: 1.5 }, { ...input, expectedDraftHash: "not-a-hash" }]) {
      await expect(value.publications.prepare(value.access, invalid)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
    await expect(value.publications.commit(value.access, input, {} as WorkspacePublicationArtifact)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(await receipt(value, input)).toBeUndefined()
    expect(await versionCount(value)).toBe(0)
  }))

  it("publishes exactly once for concurrent identical phases through independent provider pools", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), second = createLocalPersistenceProvider({ connectionString: value.connectionString })
    try {
      const prepared = await Promise.all([value.publications, second.workspacePublications].map((store) => store.prepare(value.access, input)))
      expect(prepared[1]).toEqual(prepared[0])
      if (prepared[0].status !== "ready") throw new Error("Expected preparation")
      const metadata = artifact(prepared[0])
      const results = await Promise.all([value.publications, second.workspacePublications].map((store) => store.commit(value.access, input, metadata)))
      expect(results[1]).toEqual(results[0])
      expect(await versionCount(value)).toBe(1)
      expect(await receipt(value, input)).toMatchObject({ phase: "final", receipt: { status: "published" } })
    } finally { await second.close() }
  }))

  it("replays a lost acknowledgement only after rechecking session expiry and membership revocation", async () => check(async (value) => {
    const source = await draft(value), published = await publish(value, source)
    expect(await value.publications.prepare(value.access, published.input)).toEqual(published.result)
    expect(await value.publications.commit(value.access, published.input, published.artifact)).toEqual(published.result)
    await mutate(value, (state) => { state.sessions[0].expiresAt = Date.now() - 1 })
    await expect(value.publications.prepare(value.access, published.input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await mutate(value, (state) => { state.sessions[0].expiresAt = Date.now() + 600_000; state.teams[0].members = [] })
    await expect(value.publications.commit(value.access, published.input, published.artifact)).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(await value.publications.resolve(published.prepared.binding.publicId)).not.toBeNull()
    expect(await versionCount(value)).toBe(1)
  }))

  it("keeps an original published receipt while reconciling a newer private draft as a conflict", async () => check(async (value) => {
    const source = await draft(value), published = await publish(value, source)
    await value.provider.workspaceDrafts.save(value.access, { id: source.id, requestId: randomUUID(), expectedRevision: 1, document: { ...source.document, title: "Private unsent changes" } })
    const replay = await value.publications.prepare(value.access, published.input)
    expect(replay).toEqual({ status: "conflict", state: { ...published.result.state, draftRevision: 2,
      draftHash: (await value.provider.visualizations.get(source.id))!.draftHash }, receipt: published.result.receipt })
    expect((await value.publications.resolve(published.prepared.binding.publicId))?.documentHash).toBe(source.draftHash)
    expect((await value.provider.versions.get(published.input.versionId))?.document.title).toBe(source.title)
  }))

  it("reports a newer live pointer while preserving the first explicit version snapshot", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), second = await publish(value, source)
    const replay = await value.publications.prepare(value.access, first.input)
    expect(replay).toMatchObject({ status: "conflict", state: { current: { versionId: second.input.versionId } }, receipt: first.result.receipt })
    expect((await value.publications.resolve(first.prepared.binding.publicId))?.versionId).toBe(second.input.versionId)
    expect((await value.publications.resolve(first.prepared.binding.publicId, first.input.versionId))?.storageKey).toBe(first.artifact.storageKey)
    expect(await versionCount(value)).toBe(2)
  }))

  it("finalizes a prepared intent as conflict when another publisher changes the live pointer", async () => check(async (value) => {
    const source = await draft(value), first = intent(source), second = intent(source)
    const staged = await ready(value, first), winner = await ready(value, second)
    await value.publications.commit(value.access, second, artifact(winner))
    const conflict = await value.publications.prepare(value.access, first)
    expect(conflict).toMatchObject({ status: "conflict", receipt: { status: "conflict", acceptedRevision: null }, state: { current: { versionId: second.versionId } } })
    expect(await value.publications.commit(value.access, first, artifact(staged))).toEqual(conflict)
    expect(await value.publications.resolve(staged.binding.publicId, first.versionId)).toBeNull()
    expect(await versionCount(value)).toBe(1)
  }))

  it("refuses to publish staged metadata after the saved revision changes between phases", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), staged = await ready(value, input)
    await value.provider.workspaceDrafts.save(value.access, { id: source.id, requestId: randomUUID(), expectedRevision: 1, document: { ...source.document, summary: "Later private summary" } })
    const conflict = await value.publications.commit(value.access, input, artifact(staged))
    expect(conflict).toMatchObject({ status: "conflict", state: { draftRevision: 2, current: null }, receipt: { acceptedRevision: null, documentHash: source.draftHash } })
    expect(await receipt(value, input)).toMatchObject({ phase: "final" })
    expect(await versionCount(value)).toBe(0)
  }))

  it("binds a global request UUID to its original normalized intent actor and target", async () => check(async (value) => {
    const source = await draft(value), input = intent(source)
    await ready(value, input)
    const other = await draft(value, createStarterReportDocument())
    for (const changed of [{ ...input, versionId: randomUUID() }, { ...input, expectedDraftHash: "f".repeat(64) },
      { ...input, id: other.id, expectedDraftHash: other.draftHash }]) {
      await expect(value.publications.prepare(value.access, changed)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    }
    const access = await withLegacyRepositoryState((state) => {
      const user = { ...value.user, id: randomUUID(), email: "editor@example.test", role: "editor" as const }
      state.users.push(user)
      state.teams[0].members.push({ userId: user.id, name: user.name, email: user.email, role: user.role })
      const tokenHash = `another-actor-${randomUUID()}`
      state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
      return { tokenHash, workspaceSlug: value.workspace.slug }
    }, value.database)
    await expect(value.publications.prepare(access, input)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(await versionCount(value)).toBe(0)
  }))

  it("reserves a global version UUID across pending requests and different visualization targets", async () => check(async (value) => {
    const source = await draft(value), first = intent(source)
    await ready(value, first)
    await expect(value.publications.prepare(value.access, { ...first, requestId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_INPUT" })
    const other = await draft(value)
    await expect(value.publications.prepare(value.access, { ...intent(other), versionId: first.versionId })).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect(await receipt(value, first)).toMatchObject({ phase: "prepared" })
  }))

  it("refuses an already existing version rather than adopting it during a prepared commit", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), prepared = await ready(value, input), metadata = artifact(prepared)
    const other = await draft(value)
    await value.provider.commands.publishVisualizationVersion({ idempotencyKey: "authored-foreign-version", visualizationId: other.id,
      expectedRevision: 1, versionId: input.versionId, label: "Existing unrelated canonical version", artifactStorageKey: "unowned-object",
      artifactUrl: "/unowned", artifactHash: metadata.artifactHash, manifest: {}, createdBy: "unrelated-canonical-actor" })
    await expect(value.publications.prepare(value.access, input)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(value.publications.commit(value.access, input, metadata)).rejects.toMatchObject({ code: "INVALID_INPUT" })
    expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBeNull()
    expect(await receipt(value, input)).toMatchObject({ phase: "prepared" })
  }))

  it("denies cross-workspace cross-team Slides and invalid projection ownership before publication", async () => check(async (value) => {
    const source = await draft(value), input = intent(source)
    await mutate(value, (state) => { state.workspaces.push({ id: randomUUID(), teamId: value.user.teamId, slug: "other", name: "Other", description: "Authored", decks: [] }) })
    const outsider = await withLegacyRepositoryState((state) => {
      const user = createLegacyOperations(state).createUser({ name: "Outside", email: "outside@example.test", passwordHash: "authored", teamName: "Outside" })
      const tokenHash = randomUUID()
      state.sessions.push({ id: randomUUID(), userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 600_000 })
      return { tokenHash, workspaceSlug: "hq" }
    }, value.database)
    for (const access of [{ ...value.access, workspaceSlug: "other" }, outsider]) {
      expect(await value.publications.get(access, source.id)).toBeNull()
      await expect(value.publications.prepare(access, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET kind = 'slides' WHERE id = $1`, [source.id])
    await expect(value.publications.prepare(value.access, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET kind = 'course' WHERE id = $1`, [source.id])
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.teams SET brand_json = '{}'::jsonb WHERE id = $1`, [`legacy-team:${value.user.teamId}`])
    await expect(value.publications.prepare(value.access, input)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(await versionCount(value)).toBe(0)
  }))

  it("preserves every existing password policy for publishing replay and anonymous version reads", async () => check(async (value) => {
    const source = await draft(value), first = await publish(value, source), second = await publish(value, source)
    for (const policy of [{ protected: true, hash: null }, { protected: false, hash: "authored-existing-hash" }]) {
      await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET password_protected = $2, password_hash = $3 WHERE id = $1`, [source.id, policy.protected, policy.hash])
      await expect(value.publications.prepare(value.access, first.input)).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect((await value.publications.get(value.access, source.id))?.current).toBeNull()
      expect(await value.publications.resolve(first.prepared.binding.publicId)).toBeNull()
      expect(await value.publications.resolve(first.prepared.binding.publicId, first.input.versionId)).toBeNull()
    }
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET password_protected = FALSE, password_hash = NULL WHERE id = $1`, [source.id])
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET password_hash = 'authored-current-password' WHERE id = $1`, [second.input.versionId])
    await expect(value.publications.prepare(value.access, intent(source))).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect((await value.publications.get(value.access, source.id))?.current).toBeNull()
    expect(await value.publications.resolve(first.prepared.binding.publicId, first.input.versionId)).toBeNull()
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET password_hash = NULL WHERE id = $1`, [second.input.versionId])
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET password_hash = 'authored-old-password' WHERE id = $1`, [first.input.versionId])
    expect(await value.publications.resolve(first.prepared.binding.publicId, first.input.versionId)).toBeNull()
    expect((await value.publications.resolve(first.prepared.binding.publicId))?.versionId).toBe(second.input.versionId)
  }))

  it("rejects mismatched artifact identities hashes bounds renderer and CSP without poisoning the prepared intent", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), prepared = await ready(value, input), valid = artifact(prepared)
    const changed = (path: string, replacement: unknown) => {
      const copy = structuredClone(valid) as unknown as Record<string, unknown>
      const keys = path.split("."), last = keys.pop()!
      let target = copy
      for (const key of keys) target = target[key] as Record<string, unknown>
      target[last] = replacement
      return copy as unknown as WorkspacePublicationArtifact
    }
    for (const invalid of [changed("storageKey", "unowned/object.json"), changed("storageHash", "f".repeat(64)),
      changed("manifest.visualizationId", source.id), changed("manifest.versionId", randomUUID()), changed("manifest.kind", "slides"),
      changed("manifest.documentHash", "f".repeat(64)), changed("manifest.publication.sourceRevision", 2), changed("manifest.publication.bindingHash", "f".repeat(64)),
      changed("manifest.publication.rawHtmlHash", "invalid"), changed("manifest.publication.sizeBytes", 8 * 1024 * 1024 + 1),
      changed("manifest.publication.storageBytes", 24 * 1024 * 1024 + 1), changed("manifest.publication.contentSecurityPolicy", "script-src *"),
      changed("manifest.rendererVersion", "visualization-course-html-v2"), changed("manifest.runtimeFeatures", ["analytics-beacon", "no-external-js"]),
      changed("manifest.createdAt", "2020-01-01T00:00:00.000Z")]) {
      await expect(value.publications.commit(value.access, input, invalid)).rejects.toBeInstanceOf(WorkspacePublicationArtifactError)
    }
    expect(await versionCount(value)).toBe(0)
    expect(await receipt(value, input)).toMatchObject({ phase: "prepared" })
    expect((await value.publications.commit(value.access, input, valid)).status).toBe("published")
  }))

  it("rolls back version pointer and final receipt together when the locked legacy transaction fails", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), prepared = await ready(value, input), metadata = artifact(prepared)
    const originalReceipt = await receipt(value, input)
    await value.database.query(`CREATE FUNCTION ${LOCAL_SCHEMA}.reject_publication_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'authored publication transaction rejection'; END; $$`)
    await value.database.query(`CREATE TRIGGER reject_publication_commit BEFORE UPDATE ON ${LOCAL_SCHEMA}.legacy_repository_state FOR EACH ROW EXECUTE FUNCTION ${LOCAL_SCHEMA}.reject_publication_commit()`)
    try {
      await expect(value.publications.commit(value.access, input, metadata)).rejects.toThrow("authored publication transaction rejection")
      expect(await versionCount(value)).toBe(0)
      expect((await value.provider.visualizations.get(source.id))?.publishedVersionId).toBeNull()
      expect(await receipt(value, input)).toEqual(originalReceipt)
    } finally {
      await value.database.query(`DROP TRIGGER reject_publication_commit ON ${LOCAL_SCHEMA}.legacy_repository_state`)
      await value.database.query(`DROP FUNCTION ${LOCAL_SCHEMA}.reject_publication_commit()`)
    }
    expect((await value.publications.commit(value.access, input, metadata)).status).toBe("published")
  }))

  it("resolves only owned committed publication snapshots and never orphan preview foreign or corrupted versions", async () => check(async (value) => {
    const source = await draft(value), input = intent(source), prepared = await ready(value, input)
    expect(await value.publications.resolve(prepared.binding.publicId, input.versionId)).toBeNull()
    await value.publications.commit(value.access, input, artifact(prepared))
    const other = await publish(value, await draft(value, createStarterReportDocument()))
    expect(await value.publications.resolve(prepared.binding.publicId, other.input.versionId)).toBeNull()
    const reference = await value.publications.resolve(prepared.binding.publicId)
    expect(reference).not.toBeNull()
    expect(reference).not.toHaveProperty("document")
    expect(reference).not.toHaveProperty("draftDocument")
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET status = 'archived' WHERE id = $1`, [source.id])
    expect((await value.publications.get(value.access, source.id))?.current).toBeNull()
    expect(await value.publications.resolve(prepared.binding.publicId)).toBeNull()
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualizations SET status = 'published' WHERE id = $1`, [source.id])
    const original = (await value.database.query(`SELECT * FROM ${LOCAL_SCHEMA}.visualization_versions WHERE id = $1`, [input.versionId])).rows[0]
    for (const patch of [{ column: "status", value: "preview" }, { column: "artifact_storage_key", value: "legacy/index.html" },
      { column: "artifact_hash", value: "f".repeat(64) }, { column: "manifest_json", value: JSON.stringify({ ...original.manifest_json as object, publication: undefined }) }]) {
      await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET ${patch.column} = $2 WHERE id = $1`, [input.versionId, patch.value])
      expect(await value.publications.resolve(prepared.binding.publicId)).toBeNull()
      await value.database.query(`UPDATE ${LOCAL_SCHEMA}.visualization_versions SET ${patch.column} = $2 WHERE id = $1`,
        [input.versionId, patch.column === "manifest_json" ? JSON.stringify(original.manifest_json) : original[patch.column]])
    }
    await value.database.query(`UPDATE ${LOCAL_SCHEMA}.teams SET brand_json = '{}'::jsonb WHERE id = $1`, [`legacy-team:${value.user.teamId}`])
    expect(await value.publications.resolve(prepared.binding.publicId)).toBeNull()
    expect(await value.publications.resolve("unrelated-public-id")).toBeNull()
  }))
})
