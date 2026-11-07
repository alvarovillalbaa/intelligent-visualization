import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { getSigningSecret } from "@/lib/env"
import type { DeckRecord } from "@/lib/types"

export const PUBLIC_DECK_ACCESS_TTL_MS = 30 * 60 * 1000
type PublicDeck = Pick<DeckRecord, "publicId" | "status" | "publishedVersionId" | "versions" | "passwordProtected" | "passwordHash">
const identity = /^[A-Za-z0-9_-]{1,128}$/

export function currentPublicDeckVersion(deck: PublicDeck) {
  if (deck.status !== "published" || !identity.test(deck.publicId) || !deck.publishedVersionId) return null
  return deck.versions.find((version) => version.id === deck.publishedVersionId && version.status === "published" && identity.test(version.id)) ?? null
}

export function publicDeckRequiresPassword(deck: PublicDeck) {
  const version = currentPublicDeckVersion(deck)
  return Boolean(deck.passwordProtected || deck.passwordHash || version?.passwordHash)
}

export function currentPublicDeckPasswordHash(deck: PublicDeck) {
  const version = currentPublicDeckVersion(deck)
  return version ? deck.passwordHash || version.passwordHash || null : null
}

function policy(deck: PublicDeck) {
  const version = currentPublicDeckVersion(deck)
  if (!version || !publicDeckRequiresPassword(deck) || !currentPublicDeckPasswordHash(deck)) return null
  return { publicId: deck.publicId, currentVersionId: version.id, policyHash: createHash("sha256")
    .update(JSON.stringify([deck.passwordProtected, deck.passwordHash ?? null, version.passwordHash ?? null])).digest("hex") }
}

function signature(payload: string) {
  return createHmac("sha256", getSigningSecret()).update("iv:public-deck-password:v1\0" + payload).digest("base64url")
}

export function createPublicDeckAccessToken(deck: PublicDeck, now = Date.now()) {
  const binding = policy(deck)
  if (!binding || !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + PUBLIC_DECK_ACCESS_TTL_MS)) throw new Error("Protected deck access is unavailable.")
  const payload = Buffer.from(JSON.stringify({ v: 1, scope: "deck-password", ...binding, exp: now + PUBLIC_DECK_ACCESS_TTL_MS }), "utf8").toString("base64url")
  return payload + "." + signature(payload)
}

export function verifyPublicDeckAccessToken(token: string | undefined, deck: PublicDeck, now = Date.now()) {
  try {
    const binding = policy(deck)
    if (!binding || typeof token !== "string" || token.length > 2048 || !Number.isSafeInteger(now) || now < 0) return false
    const parts = token.split(".")
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false
    const expected = Buffer.from(signature(parts[0]), "base64url"), actual = Buffer.from(parts[1], "base64url")
    if (actual.length !== expected.length || actual.toString("base64url") !== parts[1] || !timingSafeEqual(actual, expected)) return false
    const raw = Buffer.from(parts[0], "base64url")
    if (raw.toString("base64url") !== parts[0]) return false
    const claims = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw))
    if (!claims || typeof claims !== "object" || Array.isArray(claims)
      || Object.keys(claims).sort().join(",") !== "currentVersionId,exp,policyHash,publicId,scope,v") return false
    return claims.v === 1 && claims.scope === "deck-password" && claims.publicId === binding.publicId
      && claims.currentVersionId === binding.currentVersionId && claims.policyHash === binding.policyHash
      && Number.isSafeInteger(claims.exp) && claims.exp > now && claims.exp <= now + PUBLIC_DECK_ACCESS_TTL_MS
  } catch { return false }
}
