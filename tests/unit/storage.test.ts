import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { LocalStorageAdapter } from "@/packages/storage/local"
import { normalizeStorageKey } from "@/packages/storage/provider"

describe("LocalStorageAdapter", () => {
  it("normalizes unsafe keys", () => {
    expect(normalizeStorageKey("assets/My File.png")).toBe("assets/My-File.png")
    expect(() => normalizeStorageKey("../secret")).toThrow()
  })

  it("stores, reads, checks, and deletes objects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "iv-storage-"))
    const storage = new LocalStorageAdapter(root)
    const stored = await storage.put({
      key: "published/demo/index.html",
      body: "<html></html>",
      contentType: "text/html; charset=utf-8",
      immutable: true,
    })

    expect(stored.contentHash).toHaveLength(64)
    expect(await storage.exists({ key: stored.key })).toBe(true)
    expect((await storage.get({ key: stored.key }))?.body?.toString("utf8")).toBe("<html></html>")
    await storage.delete({ key: stored.key })
    expect(await storage.exists({ key: stored.key })).toBe(false)
  })
})
