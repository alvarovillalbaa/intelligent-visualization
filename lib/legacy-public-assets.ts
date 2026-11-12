import { isOwnedLegacyUploadKey } from "@/lib/legacy-file-access"
import type { AssetRecord, DeckRecord } from "@/lib/types"

export function snapshotLegacyPublicAssets(deck: Pick<DeckRecord, "id" | "publicId" | "assets">, teamSlug: string): AssetRecord[] {
  return deck.assets.filter((asset) => {
    if (asset.storageKey) {
      return asset.url === `/files/${asset.storageKey}`
        && isOwnedLegacyUploadKey(asset.storageKey, teamSlug, deck.id, deck.publicId)
    }
    if (asset.url.length > 4096 || /[\u0000-\u0020\u007f]/.test(asset.url)) return false
    try {
      const url = new URL(asset.url)
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
    } catch { return false }
  }).map((asset) => ({ ...asset }))
}
