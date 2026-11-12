import { describe, expect, it } from "vitest"

import { snapshotLegacyPublicAssets } from "@/lib/legacy-public-assets"
import type { AssetRecord } from "@/lib/types"

function asset(url: string, storageKey?: string): AssetRecord {
  return { id: url, kind: "document", title: "Authored attachment", description: "An authored fixture", url, storageKey }
}

function snapshot(assets: AssetRecord[]) {
  return snapshotLegacyPublicAssets({ id: "deck-a", publicId: "public-a", assets }, "team-a")
}

describe("committed legacy public attachments", () => {
  it("publishes only registered uploads owned by the deck or its team library", () => {
    const keys = ["uploads/team-a/deck-a/attachment.pdf", "uploads/team-a/public-a/image.png", "uploads/team-a/library/notes.txt"]
    const owned = keys.map((key) => asset(`/files/${key}`, key))
    expect(snapshot([...owned,
      asset("/files/uploads/team-b/deck-a/secret.pdf", "uploads/team-b/deck-a/secret.pdf"),
      asset("/files/uploads/team-a/deck-b/secret.pdf", "uploads/team-a/deck-b/secret.pdf"),
      asset("/files/uploads/team-a/deck-a/unregistered.pdf"),
      asset("https://example.test/mismatch", keys[0]),
    ])).toEqual(owned)
  })

  it("keeps generation sources and reserved artifact namespaces private", () => {
    const denied = ["uploads/team-a/public-a/sources/original.txt", "uploads/team-a/deck-a/SOURCES/original.txt", "canonical-publications/a/index.html", "published/public-a/version/index.html", "uploads/team-a/deck-a/../secret.txt"]
    expect(snapshot(denied.map((key) => asset(`/files/${key}`, key)))).toEqual([])
  })

  it("includes explicit HTTP references and rejects executable, relative, credentialed and control URLs", () => {
    const allowed = [asset("https://example.test/reference.pdf"), asset("http://example.test/reference")]
    expect(snapshot([...allowed, ...["javascript:alert(1)", "data:text/html,secret", "//example.test/ref", "/files/private", "https://name:password@example.test/ref", " https://example.test/ref", "https://example.test/\nref"].map((url) => asset(url))])).toEqual(allowed)
  })

  it("detaches a committed snapshot from later asset edits and uploads", () => {
    const original = asset("https://example.test/first.pdf")
    const assets = [original]
    const committed = snapshot(assets)
    original.title = "Later draft change"
    original.url = "https://example.test/replaced.pdf"
    assets.push(asset("https://example.test/later.pdf"))
    expect(committed).toEqual([expect.objectContaining({ title: "Authored attachment", url: "https://example.test/first.pdf" })])
    expect(committed[0]).not.toBe(original)
  })
})
