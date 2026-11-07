import { createHash } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createSupabaseStorageAdapter, SUPABASE_OBJECT_LIMIT, SUPABASE_STORAGE_TIMEOUT_MS } from "@/packages/provider-supabase/storage"
import { isOwnedLegacyUploadKey, resolveLegacyFileAccess } from "@/lib/legacy-file-access"
import { createSeedState } from "@/lib/seed"
import { slugify } from "@/lib/utils"
import type { AssetRecord, DeckVersion } from "@/lib/types"

const config = { url: "https://authored-storage.example.invalid", bucket: "private-fixture", serviceRoleKey: "sb_secret_authored_server_only_key" }
const key = "canonical-publications/authored/version/snapshot.json"
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex")
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
const bucket = () => json({ id: config.bucket, name: config.bucket, public: false })

function fixture() {
  const objects = new Map<string, { body: Buffer; contentType: string }>()
  const calls: Array<{ path: string; method: string; init: RequestInit }> = []
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), method = init?.method ?? "GET"
    calls.push({ path: url.pathname, method, init: init ?? {} })
    if (url.pathname === "/storage/v1/bucket/" + config.bucket) return bucket()
    const prefix = "/storage/v1/object/" + config.bucket
    if (url.pathname === prefix && method === "DELETE") {
      for (const name of JSON.parse(String(init?.body)).prefixes) objects.delete(name)
      return json([])
    }
    if (!url.pathname.startsWith(prefix + "/")) throw new Error("Unexpected authored HTTP boundary")
    const name = url.pathname.slice(prefix.length + 1).split("/").map(decodeURIComponent).join("/")
    if (method === "POST") {
      if (objects.has(name)) return json({ error: "Duplicate" }, 400)
      objects.set(name, { body: Buffer.from(init?.body as Uint8Array), contentType: new Headers(init?.headers).get("content-type")! })
      return json({ Key: config.bucket + "/" + name, Id: "authored-object" }, 201)
    }
    if (method !== "GET") throw new Error("Unexpected authored method")
    const value = objects.get(name)
    return value ? new Response(new Uint8Array(value.body), { headers: { "content-type": value.contentType } }) : json({ code: "NoSuchKey" }, 404)
  })
  return { objects, calls, fetcher, storage: createSupabaseStorageAdapter(config, fetcher) }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("private Supabase storage protocol", () => {
  it("rejects missing unsafe configuration and noncanonical keys before any HTTP operation", async () => {
    const fetcher = vi.fn()
    for (const patch of [{ url: "http://example.invalid" }, { url: "https://user:secret@example.invalid" }, { url: config.url + "/path" },
      { url: config.url + "?secret=hidden" }, { bucket: "../outside" }, { bucket: "" }, { serviceRoleKey: "" }, { serviceRoleKey: "line\nbreak" }]) {
      expect(() => createSupabaseStorageAdapter({ ...config, ...patch }, fetcher)).toThrow("Invalid private storage input.")
    }
    const storage = createSupabaseStorageAdapter(config, fetcher)
    for (const name of ["../secret", "uploads//alias", "uploads/My File.txt", "/absolute", "uploads/" + "x".repeat(1024)]) {
      await expect(storage.get({ key: name })).rejects.toMatchObject({ code: "STORAGE_INVALID" })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("uses server-only secret apikey headers and authenticates legacy service-role JWTs without redirect following", async () => {
    const f = fixture()
    await f.storage.health()
    expect(new Headers(f.calls[0].init.headers).get("apikey")).toBe(config.serviceRoleKey)
    expect(new Headers(f.calls[0].init.headers).has("authorization")).toBe(false)
    expect(f.calls[0].init.redirect).toBe("error"); expect(f.calls[0].init.cache).toBe("no-store")
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.authored_signature"
    const fetcher = vi.fn(async () => bucket())
    await createSupabaseStorageAdapter({ ...config, serviceRoleKey: jwt }, fetcher).health()
    const [, options] = fetcher.mock.calls[0] as unknown as [unknown, RequestInit]
    const headers = new Headers(options.headers)
    expect(headers.get("apikey")).toBe(jwt); expect(headers.get("authorization")).toBe("Bearer " + jwt)
  })

  it("refuses public mismatched unavailable and malformed bucket metadata before object access", async () => {
    for (const value of [{ ...config, public: true, id: config.bucket, name: config.bucket }, { id: "other", name: config.bucket, public: false },
      { id: config.bucket, name: config.bucket, public: null }, null]) {
      const fetcher = vi.fn(async () => json(value))
      const storage = createSupabaseStorageAdapter(config, fetcher)
      await expect(storage.put({ key, body: "private", contentType: "text/plain", immutable: true })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
    const fetcher = vi.fn(async () => new Response("provider details including a credential", { status: 503 }))
    const result = await createSupabaseStorageAdapter(config, fetcher).health()
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("credential")
  })

  it("creates exclusively and returns durable readback bytes with their actual hash while rejecting replacements", async () => {
    const f = fixture(), bytes = Buffer.from("Authored immutable publication\n")
    const stored = await f.storage.put({ key, body: bytes, contentType: "application/json", immutable: true })
    expect(stored.body).toEqual(bytes); expect(stored.contentHash).toBe(digest(bytes)); expect(stored.sizeBytes).toBe(bytes.length)
    expect(stored.url).toBeNull()
    expect(new Headers(f.calls.find((call) => call.method === "POST")!.init.headers).get("x-upsert")).toBe("false")
    for (const immutable of [true, false, undefined]) {
      await expect(f.storage.put({ key, body: "replacement", contentType: "application/json", immutable })).rejects.toMatchObject({ code: "EEXIST" })
    }
    expect(f.objects.get(key)?.body).toEqual(bytes)
    expect(f.calls.some((call) => call.method === "PUT" || call.method === "DELETE")).toBe(false)
    const vectors: Array<{ status: number; body: unknown; code: "EEXIST" | "STORAGE_UNAVAILABLE" }> = [
      { status: 400, body: { code: "KeyAlreadyExists", error: "Duplicate", statusCode: "409", message: "The resource already exists" }, code: "EEXIST" },
      { status: 409, body: { code: "KeyAlreadyExists", error: "UnknownLegacyLabel" }, code: "EEXIST" },
      { status: 400, body: { error: "KeyAlreadyExists" }, code: "EEXIST" },
      { status: 400, body: { code: "UnknownConflict", error: "Duplicate" }, code: "STORAGE_UNAVAILABLE" },
      { status: 409, body: { code: "AccessDenied", error: "KeyAlreadyExists" }, code: "STORAGE_UNAVAILABLE" },
      { status: 409, body: { error: "UnknownConflict" }, code: "STORAGE_UNAVAILABLE" },
      ...[401, 403, 404, 500].map((status) => ({ status, body: { code: "KeyAlreadyExists", error: "Duplicate" }, code: "STORAGE_UNAVAILABLE" as const })),
    ]
    for (const vector of vectors) {
      const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes("/bucket/") ? bucket() : json(vector.body, vector.status))
      const attempt = createSupabaseStorageAdapter(config, fetcher).put({ key, body: "replacement", contentType: "text/plain", immutable: true })
      await expect(attempt).rejects.toMatchObject({ code: vector.code,
        ...(vector.code === "STORAGE_UNAVAILABLE" ? { message: "Private storage is unavailable." } : {}) })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })

  it("detaches the exact Buffer or typed-array view before asynchronous bucket validation", async () => {
    for (const supplied of [Buffer.from([1, 2, 3]), new Uint8Array([90, 1, 2, 3, 91]).subarray(1, 4)]) {
      const f = fixture(), expected = Buffer.from(supplied)
      const pending = f.storage.put({ key, body: supplied, contentType: "application/octet-stream", immutable: true })
      supplied.fill(255)
      const stored = await pending
      expect(stored.body).toEqual(expected); expect(stored.contentHash).toBe(digest(expected))
      expect(f.objects.get(key)?.body).toEqual(expected)
    }
  })

  it("refuses corrupt or missing post-write readback and retains the object without compensation", async () => {
    for (const missing of [false, true]) {
      const f = fixture()
      const fetcher: typeof fetch = async (input, init) => {
        const result = await f.fetcher(input, init)
        if (String(input).includes("/object/") && init?.method === "GET") return missing ? json({ code: "NoSuchKey" }, 404) : new Response("changed", { headers: { "content-type": "text/plain" } })
        return result
      }
      await expect(createSupabaseStorageAdapter(config, fetcher).put({ key, body: "original", contentType: "text/plain" })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
      expect(f.objects.get(key)?.body.toString()).toBe("original")
      expect(f.calls.some((call) => call.method === "DELETE")).toBe(false)
    }
  })

  it("retains uncertain committed writes and reconciles an explicit exclusive retry from actual reads", async () => {
    const f = fixture()
    const fetcher: typeof fetch = async (input, init) => {
      const result = await f.fetcher(input, init)
      if (init?.method === "POST" && result.status === 201) throw new Error("Authored lost acknowledgement")
      return result
    }
    const storage = createSupabaseStorageAdapter(config, fetcher)
    await expect(storage.put({ key, body: "retained", contentType: "text/plain", immutable: true })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    await expect(storage.put({ key, body: "retained", contentType: "text/plain", immutable: true })).rejects.toMatchObject({ code: "EEXIST" })
    expect((await storage.get({ key }))?.body?.toString()).toBe("retained")
    expect(f.calls.filter((call) => call.method === "POST")).toHaveLength(2)
    expect(f.calls.some((call) => call.method === "DELETE")).toBe(false)
  })

  it("distinguishes absent objects from authorization service and malformed-response failures", async () => {
    const f = fixture()
    expect(await f.storage.get({ key })).toBeNull(); expect(await f.storage.exists({ key })).toBe(false)
    for (const response of [json({ error: "AccessDenied" }, 403), json({ error: "InternalError" }, 500), new Response("not json", { status: 400 }),
      new Response("bytes without a type", { headers: { "content-type": "" } })]) {
      const fetcher: typeof fetch = async (input) => String(input).includes("/bucket/") ? bucket() : response
      await expect(createSupabaseStorageAdapter(config, fetcher).get({ key })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    }
  })

  it("bounds both declared and streamed response bodies and cancels incomplete readers", async () => {
    for (const declared of [false, true]) {
      const cancel = vi.fn()
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65537)) }, cancel })
      const response = new Response(stream, { headers: declared ? { "content-length": "65537" } : {} })
      const fetcher = vi.fn(async () => response)
      await expect(createSupabaseStorageAdapter(config, fetcher).get({ key })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
      expect(cancel).toHaveBeenCalledTimes(1)
    }
    expect(SUPABASE_OBJECT_LIMIT).toBe(64 * 1024 * 1024)
  })

  it("bounds a stalled HTTP operation and forwards abort without automatic retry", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => {}) })
    const outcome = createSupabaseStorageAdapter(config, fetcher).get({ key }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(SUPABASE_STORAGE_TIMEOUT_MS)
    expect(await outcome).toMatchObject({ code: "STORAGE_UNAVAILABLE" }); expect(signal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("deletes only an explicitly requested key and returns only gated internal legacy reader URLs", async () => {
    const f = fixture(), legacy = "legacy-slides/uploads/team/library/private.txt"
    await f.storage.put({ key: legacy, body: "private source", contentType: "text/plain" })
    expect(f.storage.getPublicUrl(legacy)).toBe("/files/uploads/team/library/private.txt")
    for (const name of [key, "legacy-slides/published/id/version/index.html", "unregistered/object.bin"]) expect(f.storage.getPublicUrl(name)).toBeNull()
    expect("getSignedUrl" in f.storage).toBe(false)
    await f.storage.delete({ key: legacy })
    expect(f.objects.has(legacy)).toBe(false)
    const deletion = f.calls.find((call) => call.method === "DELETE")!
    expect(JSON.parse(String(deletion.init.body))).toEqual({ prefixes: [legacy] })
  })
})

function legacyFixture() {
  const state = createSeedState(), user = state.users[0]
  const deck = state.decks.find((row) => row.teamId === user.teamId)!
  const team = state.teams.find((row) => row.id === user.teamId)!
  deck.id = "AuThored_Deck42"; deck.publicId = "PuBlic_Id9"; team.slug = "Authored_Team-X"
  state.decks = [deck]
  const now = 1000000, tokenHash = "authored-session-hash"
  state.sessions = [{ id: "authored-session", userId: user.id, tokenHash, createdAt: now - 100, expiresAt: now + 1000 }]
  const key = `uploads/${slugify(team.slug)}/${slugify(deck.id)}/authored-image.png`
  const asset: AssetRecord = { id: "authored-image", kind: "image", title: "Authored image", description: "Explicit attachment", storageKey: key, url: "/files/" + key, contentType: "image/png", sizeBytes: 3 }
  deck.assets = [asset]
  deck.status = "published"; deck.passwordProtected = false; delete deck.passwordHash
  const version: DeckVersion = { ...deck.versions[0], id: "authored-published-version", status: "published", publicAssets: [structuredClone(asset)] }
  delete version.passwordHash
  deck.versions = [version]; deck.publishedVersionId = version.id
  return { state, deck, team, user, key, asset, version, now, tokenHash }
}

describe("legacy file metadata authorization", () => {
  it("requires a live session current membership owned namespace and registered exact key for private originals", () => {
    const f = legacyFixture(), sourceKey = `uploads/${slugify(f.team.slug)}/${slugify(f.deck.publicId)}/sources/authored.txt`
    expect(f.key).toBe("uploads/authored-team-x/authored-deck42/authored-image.png")
    f.deck.assets.push({ ...f.asset, id: "source", kind: "document", storageKey: sourceKey, url: "/files/" + sourceKey })
    expect(resolveLegacyFileAccess(f.state, sourceKey, f.tokenHash, f.now)).toBe("private")
    expect(resolveLegacyFileAccess(f.state, sourceKey, null, f.now)).toBeNull()
    expect(resolveLegacyFileAccess(f.state, sourceKey, f.tokenHash, f.now + 1000)).toBeNull()
    f.team.members = f.team.members.filter((member) => member.userId !== f.user.id)
    expect(resolveLegacyFileAccess(f.state, sourceKey, f.tokenHash, f.now)).toBeNull()
    expect(resolveLegacyFileAccess(f.state, `uploads/${slugify(f.team.slug)}/library/unregistered.txt`, f.tokenHash, f.now)).toBeNull()
    for (const invalid of ["../secret", "published/public/version/index.html", "canonical-publications/id/object.json", "uploads/other-team/library/secret.txt"]) {
      expect(isOwnedLegacyUploadKey(invalid, f.team.slug, f.deck.id, f.deck.publicId, true)).toBe(false)
    }
    for (const invalidId of ["", "___", "---", "../outside", "nested/id", "id with spaces"]) {
      expect(isOwnedLegacyUploadKey(f.key, f.team.slug, invalidId, f.deck.publicId)).toBe(false)
      expect(isOwnedLegacyUploadKey(sourceKey, f.team.slug, f.deck.id, invalidId, true)).toBe(false)
    }
  })

  it("grants anonymous attachment reads only from committed unprotected snapshots rather than mutable draft assets", () => {
    const f = legacyFixture()
    expect(resolveLegacyFileAccess(f.state, f.key, null, f.now)).toBe("public")
    f.deck.assets = []
    expect(resolveLegacyFileAccess(f.state, f.key, null, f.now)).toBe("public")
    const added = `uploads/${slugify(f.team.slug)}/${slugify(f.deck.id)}/draft-only.png`
    f.deck.assets.push({ ...f.asset, storageKey: added, url: "/files/" + added })
    expect(resolveLegacyFileAccess(f.state, added, null, f.now)).toBeNull()
    delete f.version.publicAssets
    expect(resolveLegacyFileAccess(f.state, f.key, null, f.now)).toBeNull()
    expect(resolveLegacyFileAccess(f.state, added, f.tokenHash, f.now)).toBe("private")
    for (const foreign of ["uploads/other-team/authored-deck42/foreign.png", "uploads/authored-team-x/other-deck/foreign.png"]) {
      const wrong = { ...f.asset, storageKey: foreign, url: "/files/" + foreign }
      f.deck.assets.push(wrong); f.version.publicAssets = [wrong]
      expect(resolveLegacyFileAccess(f.state, foreign, f.tokenHash, f.now)).toBeNull()
      expect(resolveLegacyFileAccess(f.state, foreign, null, f.now)).toBeNull()
    }
  })

  it("refuses password protected preview stale mismatched and original-source public references", () => {
    for (const change of [
      (f: ReturnType<typeof legacyFixture>) => { f.deck.passwordProtected = true },
      (f: ReturnType<typeof legacyFixture>) => { f.deck.passwordHash = "authored-hash" },
      (f: ReturnType<typeof legacyFixture>) => { f.version.passwordHash = "authored-hash" },
      (f: ReturnType<typeof legacyFixture>) => { f.deck.status = "draft" },
      (f: ReturnType<typeof legacyFixture>) => { f.version.status = "preview" },
      (f: ReturnType<typeof legacyFixture>) => { f.deck.publishedVersionId = "absent" },
      (f: ReturnType<typeof legacyFixture>) => { f.version.publicAssets![0].url += "?other=true" },
    ]) {
      const f = legacyFixture(); change(f)
      expect(resolveLegacyFileAccess(f.state, f.key, null, f.now)).toBeNull()
    }
    const f = legacyFixture(), original = `uploads/${slugify(f.team.slug)}/${slugify(f.deck.publicId)}/sources/private.txt`
    f.version.publicAssets = [{ ...f.asset, storageKey: original, url: "/files/" + original }]
    expect(resolveLegacyFileAccess(f.state, original, null, f.now)).toBeNull()
  })
})
