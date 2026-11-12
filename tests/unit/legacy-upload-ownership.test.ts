import { describe, expect, it, vi } from "vitest"

import { getBaseUrl } from "@/lib/env"
import { createLegacyOperations } from "@/lib/legacy-operations"
import { hasUniqueLegacyTeamNamespace, resolveLegacyFileAccess } from "@/lib/legacy-file-access"
import { createSeedState } from "@/lib/seed"
import type { AssetRecord } from "@/lib/types"
import { slugify } from "@/lib/utils"

// Keep actual legacy mutations and publication snapshots; only artifact writes
// are authored leaves. These metadata fixtures do not prove object-store ACLs.
vi.mock("@/lib/storage", () => ({
  writePublishedArtifact: vi.fn(async ({ publicId, versionId }: { publicId: string; versionId: string }) => ({
    artifactStorageKey: `published/${publicId}/${versionId}/index.html`,
    artifactUrl: `/published/${publicId}/${versionId}`,
  })),
  writeStoredText: vi.fn(async () => { throw new Error("Unexpected source write") }),
}))

function fixture() {
  const state = createSeedState()
  const operations = createLegacyOperations(state)
  const user = state.users[0], team = state.teams[0], deck = state.decks[0]
  deck.id = "Authored_Deck42"
  deck.publicId = "Public_Id9"
  deck.assets = []
  const now = Date.now()
  operations.createSession({ id: "authored-session", userId: user.id, tokenHash: "authored-token-hash", createdAt: now, expiresAt: now + 60_000 })
  return { state, operations, user, team, deck, now }
}

function input(teamName: string, index: number) {
  return { name: `Authored owner ${index}`, email: `owner-${index}@example.test`, passwordHash: "authored-private-hash", teamName }
}

function attachment(key: string): Omit<AssetRecord, "id"> {
  return { kind: "document", title: "Authored attachment", description: "Owner-controlled metadata", url: `/files/${key}`, storageKey: key }
}

describe("legacy upload namespace ownership", () => {
  it("allocates distinct physical team namespaces for duplicate and long names without changing display names", () => {
    const { state, operations, team } = fixture()
    team.slug = "Team_Alias"
    const names = ["Team Alias", "Duplicate team", "Duplicate team", `${"x".repeat(64)} alpha`, `${"x".repeat(64)} beta`, `${"x".repeat(64)} gamma`]
    const created = names.map((name, index) => operations.createUser(input(name, index)))
    const teams = created.map((user) => state.teams.find((row) => row.id === user.teamId)!)
    expect(teams.map((row) => row.name)).toEqual(names)
    expect(teams.map((row) => row.slug)).toEqual(["team-alias-2", "duplicate-team", "duplicate-team-2", "x".repeat(64), `${"x".repeat(62)}-2`, `${"x".repeat(62)}-3`])
    expect(new Set(state.teams.map((row) => slugify(row.slug))).size).toBe(state.teams.length)
    expect(teams.every((row) => row.slug.length <= 64 && hasUniqueLegacyTeamNamespace(state, row))).toBe(true)
  })

  it("rejects known foreign library keys and unregistered internal file URLs at asset registration", () => {
    const { state, operations, user, team, deck } = fixture()
    const foreignUser = operations.createUser(input("Foreign team", 1))
    const foreignTeam = state.teams.find((row) => row.id === foreignUser.teamId)!
    const foreign = `uploads/${slugify(foreignTeam.slug)}/library/known-private.pdf`
    const own = `uploads/${slugify(team.slug)}/${slugify(deck.id)}/owned.pdf`
    const before = structuredClone(deck.assets)
    expect(() => operations.addAsset(user.id, deck.id, attachment(foreign))).toThrow("does not belong")
    expect(() => operations.addAsset(user.id, deck.id, { ...attachment(own), url: `/files/${foreign}` })).toThrow("does not belong")
    for (const url of [`/files/${foreign}`, new URL(`/files/${foreign}`, getBaseUrl()).href, `/%66iles/${foreign}`]) {
      expect(() => operations.addAsset(user.id, deck.id, { kind: "document", title: "Not registered", description: "", url })).toThrow("require owned storage metadata")
    }
    expect(deck.assets).toEqual(before)
    expect(() => operations.addAsset(foreignUser.id, deck.id, attachment(own))).toThrow("Deck not found")
  })

  it("fails closed for existing ambiguous namespaces on private reads and public attachment snapshots", async () => {
    const { state, operations, user, team, deck, now } = fixture()
    const otherUser = operations.createUser(input("Historical other team", 1))
    const otherTeam = state.teams.find((row) => row.id === otherUser.teamId)!
    const key = `uploads/${slugify(team.slug)}/library/known-private.pdf`
    deck.assets = [{ id: "historical-internal", ...attachment(key) }]
    deck.versions[0].publicAssets = structuredClone(deck.assets)
    deck.publishedVersionId = deck.versions[0].id
    expect(resolveLegacyFileAccess(state, key, "authored-token-hash", now)).toBe("private")
    expect(resolveLegacyFileAccess(state, key, null, now)).toBe("public")

    // Model pre-existing imported rows, not newly allocated signup slugs.
    otherTeam.slug = team.slug.toUpperCase().replace(/-/g, "_")
    expect(hasUniqueLegacyTeamNamespace(state, team)).toBe(false)
    expect(resolveLegacyFileAccess(state, key, "authored-token-hash", now)).toBeNull()
    expect(resolveLegacyFileAccess(state, key, null, now)).toBeNull()
    expect(() => operations.addAsset(user.id, deck.id, attachment(key))).toThrow("does not belong")
    const external = { kind: "document" as const, title: "Explicit reference", description: "", url: "https://example.test/reference.pdf" }
    operations.addAsset(user.id, deck.id, external)
    const version = await operations.publishVersion(user.id, deck.id, deck.source, "Authored publication")
    expect(version.publicAssets).toEqual([expect.objectContaining(external)])
    expect(deck.assets.some((row) => row.storageKey === key)).toBe(true)
    expect(resolveLegacyFileAccess(state, key, null, now)).toBeNull()

    otherTeam.slug = team.slug
    expect(operations.getPublicDeck(team.slug, deck.slug)).toBeNull()
    expect(state.teams.map((row) => row.slug)).toEqual([team.slug, team.slug])
  })

  it("retains unambiguous existing upload URLs ownership and explicitly published external attachments", async () => {
    const { state, operations, user, team, deck, now } = fixture()
    team.slug = "Existing_Team-X"
    const prefix = `uploads/${slugify(team.slug)}`
    const keys = [`${prefix}/${slugify(deck.id)}/image.png`, `${prefix}/library/attachment.pdf`]
    for (const key of keys) operations.addAsset(user.id, deck.id, attachment(key))
    const sourceKey = `${prefix}/${slugify(deck.publicId)}/sources/original.txt`
    operations.addAsset(user.id, deck.id, attachment(sourceKey))
    operations.addAsset(user.id, deck.id, { kind: "document", title: "External reference", description: "", url: "https://example.test/files/reference.pdf" })
    const version = await operations.publishVersion(user.id, deck.id, deck.source, "Explicit sharing")
    expect(version.publicAssets).toHaveLength(3)
    expect(version.publicAssets?.map((row) => row.storageKey).filter(Boolean).sort()).toEqual([...keys].sort())
    for (const key of keys) {
      expect(resolveLegacyFileAccess(state, key, "authored-token-hash", now)).toBe("private")
      expect(resolveLegacyFileAccess(state, key, null, now)).toBe("public")
      expect(deck.assets.find((row) => row.storageKey === key)?.url).toBe(`/files/${key}`)
    }
    expect(resolveLegacyFileAccess(state, sourceKey, "authored-token-hash", now)).toBe("private")
    expect(resolveLegacyFileAccess(state, sourceKey, null, now)).toBeNull()
    expect(operations.getPublicDeck(team.slug, deck.slug)?.deck.id).toBe(deck.id)
    expect(operations.getPublicDeckById(deck.publicId)?.deck.id).toBe(deck.id)
  })
})
