import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { PublicAccessGate } from "@/components/slides/deck-player"
import { PublishedDeckFrame } from "@/components/slides/published-deck-frame"
import { PublishedAttachments } from "@/components/slides/published-attachments"
import { repository } from "@/lib/repository"
import { snapshotLegacyPublicAssets } from "@/lib/legacy-public-assets"
import { currentPublicDeckVersion, publicDeckRequiresPassword, verifyPublicDeckAccessToken } from "@/lib/public-deck-access"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamSlug: string; deckSlug: string }>
}): Promise<Metadata> {
  const { teamSlug, deckSlug } = await params
  const view = await repository.getPublicDeck(teamSlug, deckSlug)

  if (!view || !currentPublicDeckVersion(view.deck)) {
    return {}
  }
  if (publicDeckRequiresPassword(view.deck)) return { title: "Protected presentation", description: "A password is required to view this presentation." }

  return {
    title: view.version.source.seoTitle,
    description: view.version.source.seoDescription,
    openGraph: {
      title: view.version.source.seoTitle,
      description: view.version.source.seoDescription,
      images: [`/d/${teamSlug}/${deckSlug}/opengraph-image`],
    },
  }
}

export default async function PublicDeckPage({
  params,
}: {
  params: Promise<{ teamSlug: string; deckSlug: string }>
}) {
  const { teamSlug, deckSlug } = await params
  const view = await repository.getPublicDeck(teamSlug, deckSlug)

  if (!view || !currentPublicDeckVersion(view.deck)) {
    notFound()
  }

  const cookieStore = await cookies()
  const hasAccess = verifyPublicDeckAccessToken(cookieStore.get(`slides_public_${view.deck.publicId}`)?.value, view.deck)

  if (publicDeckRequiresPassword(view.deck) && !hasAccess) {
    return <PublicAccessGate deck={{ title: view.version.source.title, publicId: view.deck.publicId }} />
  }

  return (
    <>
      <PublishedDeckFrame
        src={`/published/${view.deck.publicId}/${view.version.id}`}
        title={view.version.source.title}
      />
      {!publicDeckRequiresPassword(view.deck) ? <PublishedAttachments assets={snapshotLegacyPublicAssets({
        id: view.deck.id, publicId: view.deck.publicId, assets: view.version.publicAssets ?? [],
      }, view.team.slug)} /> : null}
    </>
  )
}
