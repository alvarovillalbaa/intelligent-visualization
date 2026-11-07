import type { AssetRecord, RepositoryState } from "@/lib/types"
import { normalizeStorageKey } from "@/packages/storage/provider"

export function isOwnedLegacyUploadKey(key: string, teamSlug: string, deckId: string, publicId: string, allowSources = false) {
  try { if (key.length > 1024 || normalizeStorageKey(key) !== key) return false } catch { return false }
  const parts = key.split("/")
  if (parts.length < 4 || parts[0] !== "uploads" || parts[1] !== teamSlug || !["library", deckId, publicId].includes(parts[2])) return false
  if (parts.slice(3).some((part) => part.toLowerCase() === "sources")) {
    return allowSources && parts[2] === publicId && parts[3] === "sources" && parts.length >= 5
  }
  return true
}

function registered(asset: AssetRecord, key: string) {
  return asset.storageKey === key && asset.url === "/files/" + key
}

// This is metadata authorization, not an object-existence probe. The caller must
// obtain fresh state from its selected persistence provider before reading bytes.
export function resolveLegacyFileAccess(state: RepositoryState, key: string, tokenHash: string | null, now = Date.now()): "private" | "public" | null {
  if (!key.startsWith("uploads/") || !Number.isFinite(now)) return null
  const session = tokenHash ? state.sessions.find((row) => row.tokenHash === tokenHash && row.expiresAt > now) : null
  const user = session ? state.users.find((row) => row.id === session.userId) : null
  for (const deck of state.decks) {
    const team = state.teams.find((row) => row.id === deck.teamId)
    if (!team || !state.workspaces.some((row) => row.id === deck.workspaceId && row.teamId === team.id)) continue
    if (user?.teamId === team.id && team.members.some((member) => member.userId === user.id)
      && isOwnedLegacyUploadKey(key, team.slug, deck.id, deck.publicId, true)
      && deck.assets.some((asset) => registered(asset, key))) return "private"
    if (deck.status !== "published" || !deck.publishedVersionId || deck.passwordProtected || deck.passwordHash
      || !deck.versions.some((version) => version.id === deck.publishedVersionId && version.status === "published")
      || !isOwnedLegacyUploadKey(key, team.slug, deck.id, deck.publicId)) continue
    if (deck.versions.some((version) => version.status === "published" && !version.passwordHash
      && version.publicAssets?.some((asset) => registered(asset, key)))) return "public"
  }
  return null
}
