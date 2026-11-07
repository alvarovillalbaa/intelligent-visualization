// T3: actual local Supabase Storage/Auth. Only HTTPS-to-owned-loopback transport is remapped.
import { createHash, randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createSupabaseStorageAdapter } from "@/packages/provider-supabase/storage"
import type { StoredObject } from "@/packages/storage/provider"
import { readFixtureJson, readFixtureValue, SUPABASE_FIXTURE_ORIGIN, withSupabaseFixture } from "@/tests/providers/supabase-fixture"

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
function bodyOf(object: StoredObject | null) {
  expect(object?.body).toBeDefined()
  if (!object?.body) throw new Error("Actual private object body missing")
  return Buffer.from(object.body)
}

describe("native private Supabase Storage contract", () => {
  it("uploads and reads actual private object bytes with independent readback size and digest", async () => withSupabaseFixture(async ({ storage, prefix, keys }) => {
    expect((await storage.health()).ok).toBe(true)
    const key = prefix + "roundtrip.bin", bytes = Buffer.from("Authored private original\0with bytes", "utf8")
    keys.add(key)
    const created = await storage.put({ key, body: bytes, contentType: "application/octet-stream", immutable: true })
    expect(created.sizeBytes).toBe(bytes.length); expect(created.contentHash).toBe(hash(bytes)); expect(created.url).toBeNull()
    const read = await storage.get({ key })
    expect(bodyOf(read).equals(bytes)).toBe(true); expect(read!.contentHash).toBe(hash(bytes)); expect(await storage.exists({ key })).toBe(true)
  }))

  it("admits exactly one immutable writer across independent adapters and preserves its winning bytes", async () => withSupabaseFixture(async ({ storage, transport, serviceKey, prefix, keys }) => {
    const other = createSupabaseStorageAdapter({ url: SUPABASE_FIXTURE_ORIGIN, serviceRoleKey: serviceKey, bucket: "iv-private-checks" }, transport)
    const key = prefix + "exclusive.txt", inputs = [Buffer.from("winner A"), Buffer.from("winner B")]
    keys.add(key)
    const outcomes = await Promise.allSettled([storage, other].map((adapter, index) => adapter.put({ key, body: inputs[index], contentType: "text/plain", immutable: true })))
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(1)
    const denied = outcomes.find((row) => row.status === "rejected") as PromiseRejectedResult
    expect(denied.reason).toMatchObject({ code: "EEXIST" })
    const winner = outcomes.findIndex((row) => row.status === "fulfilled"), read = await storage.get({ key })
    expect(bodyOf(read).equals(inputs[winner])).toBe(true); expect(read!.contentHash).toBe(hash(inputs[winner]))
    await expect(storage.put({ key, body: "replacement", contentType: "text/plain", immutable: true })).rejects.toMatchObject({ code: "EEXIST" })
    expect((await storage.get({ key }))!.contentHash).toBe(hash(inputs[winner]))
  }))

  it("captures a Buffer and an offset view before real asynchronous upload without including unrelated backing bytes", async () => withSupabaseFixture(async ({ storage, prefix, keys }) => {
    const body = Buffer.from("original buffer"), first = prefix + "buffer.bin", backing = new Uint8Array([9, 1, 2, 3, 8]), second = prefix + "view.bin"
    keys.add(first); keys.add(second)
    const a = storage.put({ key: first, body, contentType: "application/octet-stream", immutable: true })
    body.fill(0)
    const b = storage.put({ key: second, body: backing.subarray(1, 4), contentType: "application/octet-stream", immutable: true })
    backing.fill(7)
    const [aResult, bResult] = await Promise.all([a, b])
    expect(aResult.contentHash).toBe(hash(Buffer.from("original buffer"))); expect(bResult.contentHash).toBe(hash(Buffer.from([1, 2, 3])))
    expect(bodyOf(await storage.get({ key: second }))).toEqual(Buffer.from([1, 2, 3]))
  }))

  it("deletes only an explicitly named owned object and distinguishes confirmed missing objects", async () => withSupabaseFixture(async ({ storage, prefix, keys }) => {
    const first = prefix + "delete.txt", retained = prefix + "retained.txt"
    keys.add(first); keys.add(retained)
    for (const key of [first, retained]) await storage.put({ key, body: key, contentType: "text/plain", immutable: true })
    const before = (await storage.get({ key: retained }))!.contentHash
    await storage.delete({ key: first }); keys.delete(first)
    expect(await storage.get({ key: first })).toBeNull(); expect(await storage.exists({ key: first })).toBe(false)
    expect((await storage.get({ key: retained }))!.contentHash).toBe(before)
  }))

  it("refuses anonymous object reads public URLs listings writes and deletion without exposing private bytes", async () => withSupabaseFixture(async ({ storage, request, anonKey, prefix, keys }) => {
    const key = prefix + "private.txt", marker = "authored-private-marker-" + randomUUID()
    const candidate = prefix + "anonymous.txt", binaryCandidate = prefix + "anonymous-binary.bin"
    for (const owned of [key, candidate, binaryCandidate]) keys.add(owned)
    await storage.put({ key, body: marker, contentType: "text/plain", immutable: true })
    const assertRetained = async () => {
      const retained = await storage.get({ key }), bytes = bodyOf(retained)
      expect(bytes.toString()).toBe(marker)
      expect(retained!.sizeBytes).toBe(Buffer.byteLength(marker)); expect(retained!.contentHash).toBe(hash(Buffer.from(marker)))
    }
    await assertRetained()
    for (const [method, pathname, body] of [
      ["GET", "/storage/v1/object/iv-private-checks/" + key, undefined],
      ["GET", "/storage/v1/object/authenticated/iv-private-checks/" + key, undefined],
      ["GET", "/storage/v1/object/public/iv-private-checks/" + key, undefined],
      ["POST", "/storage/v1/object/list/iv-private-checks", JSON.stringify({ prefix })],
      ["POST", "/storage/v1/object/iv-private-checks/" + candidate, "denied"],
      ["DELETE", "/storage/v1/object/iv-private-checks", JSON.stringify({ prefixes: [key] })],
    ] as const) {
      const response = await request(pathname, { method, headers: { apikey: anonKey, Authorization: "Bearer " + anonKey, "content-type": "application/json" }, ...(body === undefined ? {} : { body }) })
      const emptyVisibleResult = response.status === 200 && (
        method === "POST" && pathname === "/storage/v1/object/list/iv-private-checks"
        || method === "DELETE" && pathname === "/storage/v1/object/iv-private-checks")
      if (emptyVisibleResult) {
        // These exact RLS-filtered operations may return no visible/deleted rows.
        expect(await readFixtureValue(response)).toEqual([])
      } else {
        expect([400, 401, 403, 404]).toContain(response.status)
        const value = await readFixtureJson(response); expect(JSON.stringify(value).includes(marker)).toBe(false)
      }
      await assertRetained()
      if (method === "POST" && pathname === "/storage/v1/object/iv-private-checks/" + candidate) expect(await storage.get({ key: candidate })).toBeNull()
    }
    const binary = await request("/storage/v1/object/iv-private-checks/" + binaryCandidate, { method: "POST",
      headers: { apikey: anonKey, Authorization: "Bearer " + anonKey, "content-type": "application/octet-stream" },
      body: new Uint8Array(Buffer.from("authored-binary-unauthorized-write")) })
    expect([400, 401, 403, 404]).toContain(binary.status)
    expect(JSON.stringify(await readFixtureJson(binary)).includes(marker)).toBe(false)
    await assertRetained()
    expect(await storage.get({ key: binaryCandidate })).toBeNull()
    expect(await storage.get({ key: candidate })).toBeNull()
  }))

  it("refuses a genuine authenticated user token without a private bucket policy", async () => withSupabaseFixture(async ({ storage, request, serviceKey, anonKey, prefix, keys, authUsers }) => {
    const email = "storage-" + randomUUID() + "@authored.invalid", password = "Authored-ci-only-42!"
    const created = await request("/auth/v1/admin/users", { method: "POST", headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "content-type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) })
    expect(created.status).toBe(200)
    const user = await readFixtureJson(created)
    if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/.test(user.id)) throw new Error("Owned Auth user identity missing")
    authUsers.add(user.id)
    const login = await request("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: anonKey, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })
    expect(login.status).toBe(200)
    const token = (await readFixtureJson(login)).access_token
    if (typeof token !== "string") throw new Error("Owned authenticated token missing")
    const who = await request("/auth/v1/user", { headers: { apikey: anonKey, Authorization: "Bearer " + token } })
    expect(who.status).toBe(200); expect((await readFixtureJson(who)).id).toBe(user.id)
    const dataApi = await request("/rest/v1/legacy_repository_state?select=key", { headers: { apikey: anonKey, Authorization: "Bearer " + token, "Accept-Profile": "intelligent_visualization_supabase" } })
    expect([401, 403, 404, 406]).toContain(dataApi.status)
    expect(typeof (await readFixtureJson(dataApi)).code).toBe("string")
    const key = prefix + "member-private.txt"; keys.add(key)
    await storage.put({ key, body: "private", contentType: "text/plain", immutable: true })
    const denied = await request("/storage/v1/object/iv-private-checks/" + key, { headers: { apikey: anonKey, Authorization: "Bearer " + token } })
    expect([400, 401, 403, 404]).toContain(denied.status); await denied.body?.cancel()
  }))

  it("fails closed on a real invalid service credential instead of treating authorization failure as a missing object", async () => withSupabaseFixture(async ({ transport, prefix }) => {
    const invalid = createSupabaseStorageAdapter({ url: SUPABASE_FIXTURE_ORIGIN, serviceRoleKey: "sb_secret_authored_invalid_key_only", bucket: "iv-private-checks" }, transport)
    expect((await invalid.health()).ok).toBe(false)
    await expect(invalid.get({ key: prefix + "unknown.txt" })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
  }))

  it("rejects an actually public bucket before using it as private storage", async () => withSupabaseFixture(async ({ request, serviceKey, transport }) => {
    const bucket = "iv-public-negative-" + randomUUID()
    const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "content-type": "application/json" }
    const created = await request("/storage/v1/bucket", { method: "POST", headers, body: JSON.stringify({ id: bucket, name: bucket, public: true }) })
    expect([200, 201]).toContain(created.status); await created.body?.cancel()
    try {
      const invalid = createSupabaseStorageAdapter({ url: SUPABASE_FIXTURE_ORIGIN, serviceRoleKey: serviceKey, bucket }, transport)
      expect((await invalid.health()).ok).toBe(false)
      await expect(invalid.get({ key: "never-created.txt" })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" })
    } finally {
      const removed = await request("/storage/v1/bucket/" + bucket, { method: "DELETE", headers })
      expect([200, 204]).toContain(removed.status); await removed.body?.cancel()
    }
  }))
})
