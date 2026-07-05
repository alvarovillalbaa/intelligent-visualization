import { NextResponse } from "next/server"
import { z } from "zod"

import { buildStandaloneDeckHtml } from "@/lib/deck-runtime"
import { slugify } from "@/lib/utils"
import type { DeckSource } from "@/lib/types"

const requestSchema = z.object({
  deckSource: z.record(z.string(), z.unknown()),
})

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null))

  if (!body.success) {
    return NextResponse.json({ error: "Invalid deck source payload." }, { status: 400 })
  }

  const source = body.data.deckSource as unknown as DeckSource

  if (typeof source.title !== "string" || !Array.isArray(source.slides) || !source.slides.length) {
    return NextResponse.json({ error: "Deck source is missing slides." }, { status: 400 })
  }

  try {
    const artifactHtml = buildStandaloneDeckHtml(source, slugify(source.title || "draft"))
    return NextResponse.json({ artifactHtml })
  } catch {
    return NextResponse.json({ error: "Unable to compile draft preview." }, { status: 400 })
  }
}
