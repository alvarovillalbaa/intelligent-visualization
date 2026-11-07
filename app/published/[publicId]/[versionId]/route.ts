import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { verifySignedAccessToken } from "@/lib/access-tokens"
import { repository } from "@/lib/repository"
import { readPublishedArtifact } from "@/lib/storage"
import { currentPublicDeckPasswordHash, currentPublicDeckVersion, publicDeckRequiresPassword, verifyPublicDeckAccessToken } from "@/lib/public-deck-access"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string; versionId: string }> },
) {
  const { publicId, versionId } = await params
  const view = await repository.getPublicDeckById(publicId)
  const cookieStore = await cookies()
  const token = new URL(request.url).searchParams.get("token")
  const claims = token ? verifySignedAccessToken(token, "artifact") : null
  const version = view?.deck.versions.find((item) => item.id === versionId && item.status === "published")
  const hasCookieAccess = view ? versionId === view.deck.publishedVersionId
    && verifyPublicDeckAccessToken(cookieStore.get(`slides_public_${view.deck.publicId}`)?.value, view.deck)
    && (!version?.passwordHash || version.passwordHash === currentPublicDeckPasswordHash(view.deck)) : false

  if (!view || !currentPublicDeckVersion(view.deck) || !version) {
    return NextResponse.json({ error: "Published artifact not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  }

  if (
    (publicDeckRequiresPassword(view.deck) || version.passwordHash) &&
    !hasCookieAccess &&
    (!claims || claims.publicId !== publicId || claims.versionId !== versionId)
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "private, no-store" } })
  }

  const html = await readPublishedArtifact(publicId, versionId)

  if (!html) {
    return NextResponse.json({ error: "Published artifact not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  }

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  })
}
