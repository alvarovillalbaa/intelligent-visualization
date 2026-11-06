import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { LocalStorageAdapter } from "@/packages/storage/local"

// T3: real filesystem objects in exclusive per-case temporary directories.
async function fixture<T>(work: (root: string) => Promise<T>): Promise<T> {
  const supplied = process.env.IV_IMMUTABLE_CHECK_ROOT
  if (supplied !== undefined && (!path.isAbsolute(supplied) || path.dirname(supplied) !== "/tmp" || !/^ivi-[A-Za-z0-9_-]+$/.test(path.basename(supplied)))) {
    throw new Error("Configured immutable storage checks require an owned /tmp/ivi-* root.")
  }
  const parent = supplied ?? await fs.realpath(os.tmpdir())
  const parentIdentity = await fs.lstat(parent)
  if (!parentIdentity.isDirectory() || parentIdentity.isSymbolicLink() || (supplied !== undefined && parentIdentity.uid !== process.getuid?.())) {
    throw new Error("Immutable storage check root ownership is invalid.")
  }
  const root = await fs.mkdtemp(path.join(parent, "immutable-case-"))
  const identity = await fs.lstat(root)
  let result: T | undefined
  let primary: unknown
  try { result = await work(root) } catch (error) { primary = error }
  let cleanup: unknown
  try {
    const currentParent = await fs.lstat(parent), current = await fs.lstat(root)
    if (currentParent.isSymbolicLink() || currentParent.dev !== parentIdentity.dev || currentParent.ino !== parentIdentity.ino
      || currentParent.uid !== parentIdentity.uid || current.isSymbolicLink() || !current.isDirectory()
      || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== identity.uid
      || path.dirname(root) !== parent) throw new Error("Immutable storage fixture identity changed; removal refused.")
    await fs.rm(root, { recursive: true, force: false })
    await expect(fs.lstat(root)).rejects.toMatchObject({ code: "ENOENT" })
  } catch (error) { cleanup = error }
  if (primary && cleanup) throw new AggregateError([primary, cleanup], "Immutable storage check and owned cleanup failed.")
  if (primary) throw primary
  if (cleanup) throw cleanup
  return result as T
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

describe("exclusive local immutable storage", () => {
  it("admits exactly one concurrent immutable writer across independent adapters with the winning bytes and hash", async () => fixture(async (root) => {
    const adapters = [new LocalStorageAdapter(root), new LocalStorageAdapter(root)]
    const bodies = [Buffer.from("Authored Course publication A\n"), Buffer.from("Authored Report publication B\n")]
    const key = "published/concurrent/index.html"
    const outcomes = await Promise.allSettled(adapters.map((adapter, index) => adapter.put({ key, body: bodies[index], contentType: "text/html", immutable: true })))
    const winners = outcomes.flatMap((outcome, index) => outcome.status === "fulfilled" ? [{ index, object: outcome.value }] : [])
    const losers = outcomes.filter((outcome) => outcome.status === "rejected")
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    const winner = winners[0]
    const expected = bodies[winner.index]
    expect(winner.object.body).toEqual(expected)
    expect(winner.object.contentHash).toBe(hash(expected))
    expect(winner.object.sizeBytes).toBe(expected.byteLength)
    expect(await fs.readFile(path.join(root, key))).toEqual(expected)
    expect((await adapters[1 - winner.index].get({ key }))?.contentHash).toBe(hash(expected))
    expect(losers[0].reason).toMatchObject({ code: "EEXIST" })
  }))

  it("preserves an existing immutable object and its exact bytes when another writer is rejected", async () => fixture(async (root) => {
    const first = new LocalStorageAdapter(root), second = new LocalStorageAdapter(root)
    const key = "published/existing/index.html"
    const original = Buffer.from("Authored committed artifact\n")
    const stored = await first.put({ key, body: original, contentType: "text/html", immutable: true })
    await expect(second.put({ key, body: "Attempted replacement", contentType: "text/html", immutable: true }))
      .rejects.toMatchObject({ code: "EEXIST" })
    const read = await second.get({ key })
    expect(read?.body).toEqual(original)
    expect(read?.contentHash).toBe(stored.contentHash)
    expect(await fs.readFile(path.join(root, key))).toEqual(original)
  }))

  it("captures Buffer input before asynchronous work so caller mutation cannot change bytes or metadata hashes", async () => fixture(async (root) => {
    const adapter = new LocalStorageAdapter(root)
    const supplied = Buffer.from("Authored Buffer snapshot\n"), expected = Buffer.from(supplied)
    const key = "buffer/snapshot.bin"
    const pending = adapter.put({ key, body: supplied, contentType: "application/octet-stream", immutable: true })
    supplied.fill(0x78)
    const stored = await pending
    supplied.fill(0x79)
    expect(stored.body).toEqual(expected)
    expect(stored.contentHash).toBe(hash(expected))
    expect(stored.sizeBytes).toBe(expected.byteLength)
    expect(await fs.readFile(path.join(root, key))).toEqual(expected)
    expect((await adapter.get({ key }))?.contentHash).toBe(stored.contentHash)
  }))

  it("captures only the supplied Uint8Array view before its backing array changes", async () => fixture(async (root) => {
    const adapter = new LocalStorageAdapter(root)
    const backing = new Uint8Array([91, 92, 1, 2, 3, 4, 5, 6, 93, 94])
    const supplied = backing.subarray(2, 8), expected = Buffer.from([1, 2, 3, 4, 5, 6])
    const key = "typed-array/view.bin"
    const pending = adapter.put({ key, body: supplied, contentType: "application/octet-stream", immutable: true })
    backing.fill(255)
    const stored = await pending
    expect(stored.body).toEqual(expected)
    expect(stored.contentHash).toBe(hash(expected))
    expect(stored.sizeBytes).toBe(6)
    expect(await fs.readFile(path.join(root, key))).toEqual(expected)
  }))

  it("retains explicit and default mutable overwrite behavior with the replacement bytes and hash", async () => fixture(async (root) => {
    const first = new LocalStorageAdapter(root), second = new LocalStorageAdapter(root)
    const key = "mutable/current.json"
    await first.put({ key, body: "Authored original", contentType: "application/json" })
    for (const immutable of [false, undefined]) {
      const body = Buffer.from(`Authored replacement: ${String(immutable)}`)
      const stored = await second.put({ key, body, contentType: "application/json", immutable })
      expect(stored.body).toEqual(body)
      expect(stored.contentHash).toBe(hash(body))
      expect(await fs.readFile(path.join(root, key))).toEqual(body)
      expect((await first.get({ key }))?.contentHash).toBe(stored.contentHash)
    }
  }))

  it("preserves owned existing data and directories when filesystem writes fail", async () => fixture(async (root) => {
    const adapter = new LocalStorageAdapter(root)
    const kept = Buffer.from("Authored data retained after rejected writes")
    await adapter.put({ key: "kept.bin", body: kept, contentType: "application/octet-stream", immutable: true })
    await fs.mkdir(path.join(root, "blocked.html"))
    await fs.writeFile(path.join(root, "blocked.html", "keep.txt"), kept)
    await expect(adapter.put({ key: "blocked.html", body: "Must not replace a directory", contentType: "text/html" })).rejects.toMatchObject({ code: "EISDIR" })
    await expect(adapter.put({ key: `rejected/${"x".repeat(4096)}.html`, body: "Cannot be written", contentType: "text/html", immutable: true }))
      .rejects.toMatchObject({ code: "ENAMETOOLONG" })
    expect((await fs.lstat(path.join(root, "blocked.html"))).isDirectory()).toBe(true)
    expect(await fs.readFile(path.join(root, "blocked.html", "keep.txt"))).toEqual(kept)
    expect(await fs.readFile(path.join(root, "kept.bin"))).toEqual(kept)
    expect((await adapter.get({ key: "kept.bin" }))?.contentHash).toBe(hash(kept))
    expect(await fs.readdir(path.join(root, "rejected"))).toEqual([])
  }))
})
