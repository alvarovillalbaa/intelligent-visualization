import { createHmac } from "node:crypto"

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

const boundary = vi.hoisted(() => ({ lookup: vi.fn(), read: vi.fn(), set: vi.fn(), cookie: "" }))
vi.mock("@/lib/repository", () => ({ repository: { getPublicDeckById: boundary.lookup } }))
vi.mock("@/lib/storage", () => ({ readPublishedArtifact: boundary.read }))
vi.mock("@/lib/ai/generate-deck", () => ({ generateDeckSource: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => boundary.cookie ? { value: boundary.cookie } : undefined, set: boundary.set }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { GET } from "@/app/published/[publicId]/[versionId]/route"
import { unlockDeckAction } from "@/app/actions/decks"
import { createSignedAccessToken } from "@/lib/access-tokens"
import { hashSecret } from "@/lib/auth"
import { createSeedState } from "@/lib/seed"
import { createPublicDeckAccessToken, currentPublicDeckVersion, PUBLIC_DECK_ACCESS_TTL_MS, verifyPublicDeckAccessToken } from "@/lib/public-deck-access"

const secret = "authored-public-deck-signing-secret-for-unit-tests-only"
function fixture() {
  const state = createSeedState(), deck = state.decks[0], team = state.teams.find((row) => row.id === deck.teamId)!
  deck.status = "published"; deck.passwordProtected = true; deck.passwordHash = hashSecret("authored-password")
  const version = { ...deck.versions[0], id: "authored-published-version", status: "published" as const, passwordHash: deck.passwordHash }
  deck.versions = [version]; deck.publishedVersionId = version.id
  return { deck, team, version }
}
async function request(view: ReturnType<typeof fixture>, token?: string, versionId = view.version.id) {
  boundary.lookup.mockResolvedValue(view)
  return GET(new Request(`http://localhost/published/${view.deck.publicId}/${versionId}` + (token ? "?token=" + encodeURIComponent(token) : "")), {
    params: Promise.resolve({ publicId: view.deck.publicId, versionId }),
  })
}

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VISUALIZATION_SIGNING_SECRET", secret); boundary.cookie = ""; boundary.read.mockResolvedValue(Buffer.from("<html>Authored protected content</html>")) })
afterEach(() => { vi.unstubAllEnvs() })

describe("stateless public deck password access", () => {
  it("issues a finite domain-separated capability for the exact current password policy and publication", () => {
    const { deck } = fixture(), now = 2000000000000, token = createPublicDeckAccessToken(deck, now)
    expect(token).not.toBe("1"); expect(verifyPublicDeckAccessToken(token, deck, now)).toBe(true)
    const claims = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"))
    expect(claims.exp).toBe(now + PUBLIC_DECK_ACCESS_TTL_MS); expect(claims.scope).toBe("deck-password")
    expect(claims.currentVersionId).toBe(deck.publishedVersionId); expect(claims.policyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(claims)).not.toContain(deck.passwordHash)
    expect(verifyPublicDeckAccessToken(token, deck, now + PUBLIC_DECK_ACCESS_TTL_MS)).toBe(false)
  })

  it("rejects forged old cookies tampering cross-deck reuse changed passwords and changed current versions", () => {
    const { deck } = fixture(), now = 2000000000000, token = createPublicDeckAccessToken(deck, now)
    for (const invalid of [undefined, "1", token + ".extra", "x".repeat(2049), token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")]) {
      expect(verifyPublicDeckAccessToken(invalid, deck, now)).toBe(false)
    }
    expect(verifyPublicDeckAccessToken(token, { ...deck, publicId: "another-deck" }, now)).toBe(false)
    expect(verifyPublicDeckAccessToken(token, { ...deck, passwordHash: "different-hash" }, now)).toBe(false)
    expect(verifyPublicDeckAccessToken(token, { ...deck, status: "draft" }, now)).toBe(false)
    const next = { ...deck.versions[0], id: "new-publication" }
    expect(verifyPublicDeckAccessToken(token, { ...deck, versions: [...deck.versions, next], publishedVersionId: next.id }, now)).toBe(false)
  })

  it("refuses correctly signed malformed scope extra-field missing and nonfinite-expiry envelopes", () => {
    const { deck } = fixture(), now = 2000000000000
    const valid = JSON.parse(Buffer.from(createPublicDeckAccessToken(deck, now).split(".")[0], "base64url").toString("utf8"))
    for (const claims of [{ ...valid, exp: null }, { ...valid, exp: String(valid.exp) }, { ...valid, exp: now - 1 },
      { ...valid, exp: now + PUBLIC_DECK_ACCESS_TTL_MS + 1 }, { ...valid, scope: "artifact" }, { ...valid, unexpected: true }, { ...valid, policyHash: undefined }]) {
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
      const signature = createHmac("sha256", secret).update("iv:public-deck-password:v1\0" + payload).digest("base64url")
      expect(verifyPublicDeckAccessToken(payload + "." + signature, deck, now)).toBe(false)
    }
  })

  it("sets a bounded HttpOnly cookie only after actual password verification and refuses invalid or preview targets", async () => {
    const view = fixture(); boundary.lookup.mockResolvedValue(view)
    expect(await unlockDeckAction({ publicId: view.deck.publicId, password: "wrong" })).toMatchObject({ ok: false })
    expect(boundary.set).not.toHaveBeenCalled()
    expect(await unlockDeckAction({ publicId: view.deck.publicId, password: "authored-password" })).toEqual({ ok: true })
    const [name, token, options] = boundary.set.mock.calls[0]
    expect(name).toBe("slides_public_" + view.deck.publicId); expect(verifyPublicDeckAccessToken(token, view.deck)).toBe(true)
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: PUBLIC_DECK_ACCESS_TTL_MS / 1000 })
    boundary.set.mockClear(); view.deck.versions[0].status = "preview"
    expect(currentPublicDeckVersion(view.deck)).toBeNull()
    expect(await unlockDeckAction({ publicId: view.deck.publicId, password: "authored-password" })).toMatchObject({ ok: false })
    expect(await unlockDeckAction({ publicId: "../other", password: "authored-password" })).toMatchObject({ ok: false })
    expect(boundary.set).not.toHaveBeenCalled()
  })

  it("refuses the old raw cookie before storage and serves a valid protected capability without shared caching", async () => {
    const view = fixture(); boundary.cookie = "1"
    const refused = await request(view)
    expect(refused.status).toBe(401); expect(refused.headers.get("cache-control")).toBe("private, no-store")
    expect(boundary.read).not.toHaveBeenCalled()
    boundary.cookie = createPublicDeckAccessToken(view.deck)
    const allowed = await request(view)
    expect(allowed.status).toBe(200); expect(await allowed.text()).toContain("Authored protected content")
    expect(allowed.headers.get("cache-control")).toBe("private, no-store")
  })

  it("preserves exact-version signed artifact authority while refusing embed-scope substitution and preview bytes", async () => {
    const view = fixture(), exp = Date.now() + 60000
    const embed = createSignedAccessToken({ publicId: view.deck.publicId, versionId: view.version.id, scope: "embed", exp })
    expect((await request(view, embed)).status).toBe(401); expect(boundary.read).not.toHaveBeenCalled()
    const artifact = createSignedAccessToken({ publicId: view.deck.publicId, versionId: view.version.id, scope: "artifact", exp })
    const allowed = await request(view, artifact)
    expect(allowed.status).toBe(200); expect(allowed.headers.get("cache-control")).toBe("private, no-store")
    boundary.read.mockClear(); view.deck.versions.push({ ...view.version, id: "unpublished-preview", status: "preview" })
    const preview = createSignedAccessToken({ publicId: view.deck.publicId, versionId: "unpublished-preview", scope: "artifact", exp })
    expect((await request(view, preview, "unpublished-preview")).status).toBe(404)
    expect(boundary.read).not.toHaveBeenCalled()
    view.deck.versions.push({ ...view.version, id: "older-password-version", status: "published" })
    boundary.cookie = createPublicDeckAccessToken(view.deck)
    expect((await request(view, undefined, "older-password-version")).status).toBe(401)
    expect(boundary.read).not.toHaveBeenCalled()
    // A later unprotected publication does not remove the old version's policy.
    delete view.deck.passwordHash; view.deck.passwordProtected = false; delete view.deck.versions[0].passwordHash
    boundary.cookie = "1"
    expect((await request(view, undefined, "older-password-version")).status).toBe(401)
    const oldArtifact = createSignedAccessToken({ publicId: view.deck.publicId, versionId: "older-password-version", scope: "artifact", exp })
    expect((await request(view, oldArtifact, "older-password-version")).status).toBe(200)
  })
})
