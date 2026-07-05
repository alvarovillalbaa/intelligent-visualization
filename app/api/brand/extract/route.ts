import { NextResponse } from "next/server"
import { z } from "zod"

import { deriveThemeFromBrandKit, fetchFirecrawlBrandContext, hasUsableBrandStyle } from "@/lib/brand-kit"
import { themeLibrary } from "@/lib/deck-runtime"
import type { BrandKit } from "@/lib/types"

const requestSchema = z.object({
  url: z.string().url(),
})

const MAX_MARKDOWN = 8000

function trimBrandKit(brandKit: BrandKit): BrandKit {
  return {
    source: brandKit.source,
    extractedAt: brandKit.extractedAt,
    colors: brandKit.colors,
    fonts: brandKit.fonts.slice(0, 6),
    logos: brandKit.logos.slice(0, 4),
    imagery: [],
    notes: brandKit.notes.slice(0, 3),
    taglines: brandKit.taglines?.slice(0, 3),
    audiences: brandKit.audiences?.slice(0, 3),
    personality: brandKit.personality?.slice(0, 3),
    guidelines: brandKit.guidelines?.slice(0, 3),
    differentiators: brandKit.differentiators?.slice(0, 3),
    typography: brandKit.typography,
    composition: brandKit.composition,
    components: brandKit.components?.slice(0, 3),
  }
}

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null))

  if (!body.success) {
    return NextResponse.json({ error: "Invalid brand extraction payload." }, { status: 400 })
  }

  if (!process.env.FIRECRAWL_API_KEY) {
    return NextResponse.json({ available: false })
  }

  try {
    const context = await fetchFirecrawlBrandContext(body.data.url)

    if (!context || !hasUsableBrandStyle(context.brandKit)) {
      // Still hand back the page content so generation can reuse it without re-scraping.
      return NextResponse.json({
        available: false,
        markdown: context?.markdown?.slice(0, MAX_MARKDOWN),
      })
    }

    return NextResponse.json({
      available: true,
      brandKit: trimBrandKit(context.brandKit),
      markdown: context.markdown?.slice(0, MAX_MARKDOWN),
      proposedTheme: deriveThemeFromBrandKit(context.brandKit, themeLibrary[0]),
    })
  } catch {
    return NextResponse.json({ available: false })
  }
}
