import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { hashSecret, verifySecret } from "@/lib/auth"
import { createLegacyOperations } from "@/lib/legacy-operations"
import { readStoredFile } from "@/lib/storage"
import type { GenerationInput, RepositoryState } from "@/lib/types"
import type { LocalDatabase } from "@/packages/provider-local/database"
import { LEGACY_REPOSITORY_KEY, seedLegacyRepository, withLegacyRepositoryState } from "@/packages/provider-local/legacy-state"
import { LOCAL_SCHEMA } from "@/packages/provider-local/schema"
import { createPostgresFixture } from "./postgres-fixture"

let fixture: Awaited<ReturnType<typeof createPostgresFixture>> | undefined
let databaseModule: typeof import("@/packages/provider-local/database")
let repository: typeof import("@/lib/repository")["repository"]
let singleton: LocalDatabase | undefined

function currentFixture() {
  if (!fixture) throw new Error("The disposable legacy PostgreSQL fixture is unavailable.")
  return fixture
}

async function storedState(database = currentFixture().database): Promise<RepositoryState> {
  const { rows } = await database.query(
    `SELECT payload FROM ${LOCAL_SCHEMA}.legacy_repository_state WHERE key = $1`,
    [LEGACY_REPOSITORY_KEY],
  )
  expect(rows).toHaveLength(1)
  return rows[0].payload as RepositoryState
}

async function reopened<T>(work: (database: LocalDatabase) => Promise<T>): Promise<T> {
  const database = databaseModule.createPostgresDatabase(currentFixture().connectionString)
  try {
    return await work(database)
  } finally {
    await database.close()
  }
}

function userInput(label: string) {
  const suffix = randomUUID()
  return {
    name: `Authored ${label}`,
    email: `${label}-${suffix}@example.test`,
    passwordHash: hashSecret(`authored-password-${suffix}`),
    teamName: `Authored ${label} ${suffix}`,
  }
}

function generationInput(): GenerationInput {
  return {
    inputKind: "files",
    rawText: "Authored material for the local PostgreSQL contract check.",
    prompt: "An authored source, not a model-generated response.",
    files: [{ name: "authored-notes.txt", content: "Original notes\nwith exact UTF-8: café.", type: "text/plain" }],
    themeMode: "brand",
  }
}

beforeAll(async () => {
  fixture = await createPostgresFixture()
  vi.stubEnv("LOCAL_DATABASE_URL", fixture.connectionString)
  databaseModule = await import("@/packages/provider-local/database")
  singleton = databaseModule.getLocalDatabase()
  ;({ repository } = await import("@/lib/repository"))
}, 30_000)

afterAll(async () => {
  const errors: unknown[] = []
  try {
    if (singleton) await singleton.close()
  } catch (error) {
    errors.push(error)
  }
  try {
    if (fixture) await fixture.dispose()
  } catch (error) {
    errors.push(error)
  } finally {
    vi.unstubAllEnvs()
  }
  if (errors.length) throw new AggregateError(errors, "Legacy PostgreSQL fixture cleanup failed.")
}, 30_000)

describe.sequential("legacy PostgreSQL repository", () => {
  it("fails closed before explicit setup without seeding on a repository read", async () => {
    await expect(repository.getUserByEmail("missing@example.test")).rejects.toThrow("not initialized")
    const result = await currentFixture().database.query(
      `SELECT count(*)::int AS count FROM ${LOCAL_SCHEMA}.legacy_repository_state`,
    )
    expect(result.rows[0].count).toBe(0)
  })

  it("seeds once and preserves changed state when reopened through another connection", async () => {
    const database = currentFixture().database
    await seedLegacyRepository(database)
    const initial = await storedState()
    expect(initial.users.length).toBeGreaterThan(0)
    const input = userInput("seed-retained")
    const user = await withLegacyRepositoryState((state) => createLegacyOperations(state).createUser(input), database)
    const changed = await storedState()
    expect(changed.users).toContainEqual(user)
    await seedLegacyRepository(database)
    await seedLegacyRepository(database)
    await reopened(async (connection) => {
      expect(await storedState(connection)).toEqual(changed)
      const rows = await connection.query(`SELECT key FROM ${LOCAL_SCHEMA}.legacy_repository_state`)
      expect(rows.rows).toEqual([{ key: LEGACY_REPOSITORY_KEY }])
    })
    expect(changed.users[0].id).toBe(initial.users[0].id)
  })

  it("rolls back a thrown business mutation without exposing its partial user or workspace", async () => {
    await seedLegacyRepository(currentFixture().database)
    const before = await storedState()
    const input = userInput("rolled-back")
    const failure = new Error("Authored failure after both business mutations")
    await expect(withLegacyRepositoryState((state) => {
      const operations = createLegacyOperations(state)
      const user = operations.createUser(input)
      operations.createWorkspace(user.id, { name: "Not committed", description: "Authored rollback", slug: "not-committed" })
      throw failure
    }, currentFixture().database)).rejects.toBe(failure)
    expect(await reopened(storedState)).toEqual(before)
    expect(await repository.getUserByEmail(input.email)).toBeNull()
  })

  it("retains every concurrent mutation issued through two independent PostgreSQL pools", async () => {
    await seedLegacyRepository(currentFixture().database)
    const owner = await repository.createUser(userInput("concurrent"))
    const before = await storedState()
    const connections = [
      databaseModule.createPostgresDatabase(currentFixture().connectionString),
      databaseModule.createPostgresDatabase(currentFixture().connectionString),
    ]
    const names = Array.from({ length: 10 }, (_, index) => `concurrent-${randomUUID()}-${index}`)
    try {
      const outcomes = await Promise.allSettled(names.map((slug, index) => withLegacyRepositoryState(async (state) => {
        await new Promise<void>((resolve) => setImmediate(resolve))
        return createLegacyOperations(state).createWorkspace(owner.id, { name: slug, description: "Concurrent authored workspace", slug })
      }, connections[index % 2])))
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toEqual([])
      const after = await storedState()
      expect(after.workspaces).toHaveLength(before.workspaces.length + names.length)
      expect(after.workspaces.filter((workspace) => workspace.teamId === owner.teamId).map((workspace) => workspace.slug).sort())
        .toEqual(["hq", ...names].sort())
      expect(new Set(after.workspaces.map((workspace) => workspace.id)).size).toBe(after.workspaces.length)
    } finally {
      await Promise.all(connections.map((connection) => connection.close()))
    }
  }, 15_000)

  it("persists actual repository users and generated sessions with expiry and deletion", async () => {
    await seedLegacyRepository(currentFixture().database)
    const input = userInput("sessions")
    const user = await repository.createUser(input)
    expect(await repository.getUserByEmail(input.email.toUpperCase())).toEqual(user)
    expect(verifySecret("incorrect-authored-password", user.passwordHash)).toBe(false)
    await expect(repository.createUser({ ...input, email: input.email.toUpperCase() })).rejects.toThrow("already has an account")
    const tokenHash = `authored-session-${randomUUID()}`
    const session = await repository.createSession({ userId: user.id, tokenHash, createdAt: Date.now(), expiresAt: Date.now() + 60_000 })
    expect(session.id).toMatch(/^[A-Za-z0-9_-]{12}$/)
    const sessionUser = await repository.getSessionUser(tokenHash)
    expect(sessionUser).toMatchObject({ id: user.id, email: input.email, role: "admin", teamId: user.teamId })
    await reopened(async (database) => {
      const reloaded = await withLegacyRepositoryState((state) => createLegacyOperations(state).getSessionUser(tokenHash), database)
      expect(reloaded).toEqual(sessionUser)
      expect((await storedState(database)).sessions.find((item) => item.id === session.id)).toEqual(session)
    })
    const expiredToken = `expired-session-${randomUUID()}`
    await repository.createSession({ userId: user.id, tokenHash: expiredToken, createdAt: Date.now() - 2000, expiresAt: Date.now() - 1000 })
    expect(await repository.getSessionUser(expiredToken)).toBeNull()
    await repository.deleteSession(tokenHash)
    expect(await repository.getSessionUser(tokenHash)).toBeNull()
    expect((await reopened(storedState)).sessions.some((item) => item.id === session.id)).toBe(false)
  })

  it("preserves collision-safe workspaces and scoped invite acceptance and member-role updates", async () => {
    await seedLegacyRepository(currentFixture().database)
    const owner = await repository.createUser(userInput("invites"))
    const first = await repository.createWorkspace(owner.id, { name: "Release review", description: "First" })
    const second = await repository.createWorkspace(owner.id, { name: "Release review", description: "Second" })
    expect(first.slug).toBe("release-review")
    expect(second.slug).toBe("release-review-2")
    expect((await repository.getWorkspaceBySlug(owner.id, first.slug))?.workspace.id).toBe(first.id)
    const invitedEmail = `invited-${randomUUID()}@example.test`
    const invite = await repository.createInvite(owner.id, { email: invitedEmail, invitedName: "Authored invited member", role: "viewer", workspaceId: first.id })
    expect((await repository.getInviteByToken(invite.token))?.workspace.id).toBe(first.id)
    const member = await repository.acceptInvite({ token: invite.token, name: "Accepted member", passwordHash: hashSecret("authored-member-password") })
    expect(member).toMatchObject({ email: invitedEmail, workspaceId: first.id, teamId: owner.teamId, role: "viewer" })
    await repository.updateTeamMemberRole(owner.id, member.id, "editor")
    const dashboard = await repository.getDashboard(member.id)
    expect(dashboard?.sessionUser.role).toBe("editor")
    expect(dashboard?.team.members.find((item) => item.userId === member.id)?.role).toBe("editor")
    expect((await repository.getInviteByToken(invite.token))?.invite.status).toBe("accepted")
    await expect(repository.acceptInvite({ token: invite.token, name: "Duplicate acceptance", passwordHash: "unused" })).rejects.toThrow("Invite not found")
    await expect(repository.createInvite(owner.id, { email: `invalid-${randomUUID()}@example.test`, invitedName: "Wrong workspace", role: "viewer", workspaceId: randomUUID() })).rejects.toThrow("Workspace not found")
    const reloaded = await reopened(storedState)
    expect(reloaded.invites.find((item) => item.id === invite.id)).toMatchObject({ status: "accepted", workspaceId: first.id })
    expect(reloaded.users.find((item) => item.id === member.id)?.role).toBe("editor")
  })

  it("persists authored deck artifacts checkpoints publishing reviews experiments events and leads", async () => {
    await seedLegacyRepository(currentFixture().database)
    const owner = await repository.createUser(userInput("deck-lifecycle"))
    const source = structuredClone((await storedState()).decks[0].source)
    source.title = `Authored durable deck ${randomUUID()}`
    source.summary = "Authored local deck lifecycle; no AI request."
    const input = generationInput()
    const deck = await repository.createDeckFromGeneration(owner.id, owner.workspaceId, input, source)
    expect(deck).toMatchObject({ status: "preview", source, createdBy: owner.id })
    expect(deck.checkpoints).toHaveLength(1)
    const original = deck.assets.find((asset) => asset.title === input.files[0].name)
    expect(original?.storageKey).toBeTruthy()
    expect(await readStoredFile(original!.storageKey!)).toEqual(Buffer.from(input.files[0].content, "utf8"))
    const edited = { ...source, title: `${source.title} revised`, summary: "An authored saved checkpoint." }
    const saved = await repository.saveCheckpoint(owner.id, deck.id, edited, "Authored revision", "Saved authored checkpoint")
    expect(saved.checkpoints[0]).toMatchObject({ source: edited, title: "Saved authored checkpoint" })
    const remixed = await repository.randomizeTheme(owner.id, deck.id)
    expect(remixed.title).toBe(edited.title)
    const restored = await repository.restoreCheckpoint(owner.id, deck.id, saved.checkpoints[0].id)
    expect(restored.source).toEqual(edited)
    const passwordHash = hashSecret("authored-deck-password")
    const published = await repository.publishVersion(owner.id, deck.id, edited, "Authored publication", passwordHash)
    expect(published.status).toBe("published")
    expect(published.artifactStorageKey).toBeTruthy()
    expect(await readStoredFile(published.artifactStorageKey!)).toEqual(Buffer.from(published.artifactHtml, "utf8"))
    expect(verifySecret("authored-deck-password", published.passwordHash!)).toBe(true)
    await repository.addAsset(owner.id, deck.id, { kind: "document", title: "Retained original reference", description: "Same original file", url: original!.url, storageKey: original!.storageKey })
    const review = await repository.createReviewRequest(owner.id, deck.id, published.id, "Authored review")
    const commented = await repository.addReviewComment(review.token, { authorName: "Authored reviewer", body: "Keep the original data.", slideId: edited.slides[0].id, status: "suggestion", suggestedPrompt: "Clarify the introduction." })
    const comment = commented.comments[0]
    const appliedAt = Date.now()
    await repository.updateReviewComment(review.token, comment.id, { status: "resolved", appliedAt })
    await repository.updateReviewStatus(review.token, "approved")
    const experiment = { name: "Authored A/B", status: "running" as const, question: "Which framing?", variants: [{ id: randomUUID(), label: "Initial", versionId: deck.versions[0].id, weight: 50 }, { id: randomUUID(), label: "Published", versionId: published.id, weight: 50 }] }
    await repository.saveExperiment(owner.id, deck.id, experiment)
    const visitorId = `authored-visitor-${randomUUID()}`
    const eventBase = { publicId: deck.publicId, versionId: published.id, visitorId, createdAt: Date.now() }
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "view" })
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "slide_view", slideId: edited.slides[0].id })
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "poll_vote", value: "Authored choice" })
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "deck_complete" })
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "session_end", durationMs: 4000 })
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "cta_click" })
    await repository.recordEvent({ ...eventBase, id: randomUUID(), type: "lead_submit" })
    const lead = await repository.captureLead({ id: randomUUID(), publicId: deck.publicId, versionId: published.id, createdAt: Date.now(), payload: { email: "authored-lead@example.test", name: "Authored lead" } })
    expect(lead.deckId).toBe(deck.id)
    const editor = await repository.getDeckEditor(owner.id, deck.id)
    expect(editor?.deck.analytics).toMatchObject({ views: 1, uniqueVisitors: 1, completionRate: 100, avgTimeSeconds: 4, ctaClicks: 1, leads: 1, slideViews: { [edited.slides[0].id]: 1 }, pollVotes: { "Authored choice": 1 } })
    expect(editor?.deck.analytics.variantMetrics[published.id]).toEqual({ views: 1, uniqueVisitors: 1, completions: 1, ctaClicks: 1, leads: 1, pollVotes: 1, avgTimeSeconds: 4 })
    expect(editor?.deck.experiment).toMatchObject(experiment)
    expect(editor?.deck.assets.some((asset) => asset.title === "Retained original reference")).toBe(true)
    expect((await repository.getReviewView(review.token))?.review).toMatchObject({ status: "approved", comments: [{ id: comment.id, status: "resolved", appliedAt }] })
    expect((await repository.getPublicDeckById(deck.publicId))?.version.id).toBe(published.id)
    expect((await repository.getPublicDeck(editor!.team.slug, editor!.deck.slug))?.deck.id).toBe(deck.id)
    await reopened(async (database) => {
      const reloaded = await withLegacyRepositoryState((state) => createLegacyOperations(state).getDeckEditor(owner.id, deck.id), database)
      expect(reloaded).toEqual(editor)
      const state = await storedState(database)
      expect(state.events.filter((event) => event.deckId === deck.id)).toHaveLength(7)
      expect(state.leads.find((item) => item.id === lead.id)).toEqual(lead)
    })
  }, 15_000)

  it("denies cross-team deck workspace invite and member writes without changing the victim", async () => {
    await seedLegacyRepository(currentFixture().database)
    const intruder = await repository.createUser(userInput("cross-team"))
    const state = await storedState()
    const victim = state.decks.find((deck) => deck.createdBy === state.users[0].id)!
    const owner = state.users.find((user) => user.id === victim.createdBy)!
    expect(victim.teamId).not.toBe(intruder.teamId)
    expect(await repository.getDeckEditor(intruder.id, victim.id)).toBeNull()
    const victimWorkspace = state.workspaces.find((workspace) => workspace.id === victim.workspaceId)!
    expect(await repository.getWorkspaceBySlug(intruder.id, victimWorkspace.slug)).toBeNull()
    await expect(repository.createDeckFromGeneration(intruder.id, victim.workspaceId, generationInput(), victim.source)).rejects.toThrow("Unable to create deck")
    await expect(repository.saveCheckpoint(intruder.id, victim.id, victim.source, "Denied", "Denied")).rejects.toThrow("Deck not found")
    await expect(repository.publishVersion(intruder.id, victim.id, victim.source, "Denied")).rejects.toThrow("Deck not found")
    await expect(repository.randomizeTheme(intruder.id, victim.id)).rejects.toThrow("Deck not found")
    await expect(repository.restoreCheckpoint(intruder.id, victim.id, victim.checkpoints[0].id)).rejects.toThrow("Checkpoint not found")
    await expect(repository.createReviewRequest(intruder.id, victim.id, victim.versions[0].id, "Denied")).rejects.toThrow("Deck not found")
    await expect(repository.addAsset(intruder.id, victim.id, { kind: "document", title: "Denied", description: "Denied", url: "/denied.txt" })).rejects.toThrow("Deck not found")
    await expect(repository.saveExperiment(intruder.id, victim.id, null)).rejects.toThrow("Deck not found")
    await expect(repository.createInvite(intruder.id, { email: `denied-${randomUUID()}@example.test`, invitedName: "Denied", role: "viewer", workspaceId: victim.workspaceId })).rejects.toThrow("Workspace not found")
    await expect(repository.updateTeamMemberRole(intruder.id, owner.id, "viewer")).rejects.toThrow("Team member not found")
    const after = await reopened(storedState)
    expect(after.decks.find((deck) => deck.id === victim.id)).toEqual(victim)
    expect(after.users.find((user) => user.id === owner.id)).toEqual(owner)
    expect(after.invites).toEqual(state.invites)
  })
})
