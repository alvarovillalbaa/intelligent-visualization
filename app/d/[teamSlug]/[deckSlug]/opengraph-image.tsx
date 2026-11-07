import { ImageResponse } from "next/og"

import { repository } from "@/lib/repository"
import { currentPublicDeckVersion, publicDeckRequiresPassword } from "@/lib/public-deck-access"

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = "image/png"
export const dynamic = "force-dynamic"
const imageOptions = { ...size, headers: { "Cache-Control": "private, no-store" } }

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ teamSlug: string; deckSlug: string }>
}) {
  const { teamSlug, deckSlug } = await params
  const view = await repository.getPublicDeck(teamSlug, deckSlug)

  if (!view || !currentPublicDeckVersion(view.deck) || publicDeckRequiresPassword(view.deck)) {
    return new ImageResponse(<div />, imageOptions)
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: view.version.source.theme.gradient,
          color: view.version.source.theme.foreground,
          padding: "54px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            borderRadius: "42px",
            border: `2px solid ${view.version.source.theme.border}`,
            background: "rgba(255,255,255,0.35)",
            padding: "48px",
          }}
        >
          <div style={{ fontSize: 24, letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.72 }}>
            {view.team.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.08em" }}>
              {view.version.source.title}
            </div>
            <div style={{ fontSize: 30, maxWidth: "900px", lineHeight: 1.35, opacity: 0.78 }}>
              {view.version.source.summary}
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 24, opacity: 0.72 }}>
            <span>{view.version.source.audience}</span>
            <span>{view.version.source.poll.question}</span>
          </div>
        </div>
      </div>
    ),
    imageOptions,
  )
}
