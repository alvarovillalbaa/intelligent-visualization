import { NextResponse } from "next/server"
import { z } from "zod"

import { generateDeckSource } from "@/lib/ai/generate-deck"
import { generateVisualizationDocument } from "@/lib/ai/generate-visualization"
import { generationInputSchema } from "@/lib/ai/schema"
import { buildStandaloneDeckHtml } from "@/lib/deck-runtime"
import { createSlidesDraft } from "@/lib/visualization-drafts"
import { slugify } from "@/lib/utils"
import type { GenerationInput } from "@/lib/types"

const requestSchema = z.object({
  kind: z.enum(["slides", "course", "report"]),
  generationInput: generationInputSchema,
})

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return NextResponse.json({ error: "Invalid visualization generation payload." }, { status: 400 })
  }

  const generationInput = body.data.generationInput as GenerationInput

  if (body.data.kind === "slides") {
    const slideResult = await generateDeckSource(generationInput)
    const artifactHtml = buildStandaloneDeckHtml(
      slideResult.object,
      slugify(slideResult.object.title || "visual-draft"),
    )

    return NextResponse.json({
      kind: body.data.kind,
      document: createSlidesDraft(slideResult.object),
      deckSource: slideResult.object,
      artifactHtml,
      provider: slideResult.provider,
      modelName: slideResult.modelName,
      generatedAt: Date.now(),
    })
  }

  const result = await generateVisualizationDocument(body.data.kind, generationInput)

  return NextResponse.json({
    kind: body.data.kind,
    document: result.document,
    deckSource: null,
    artifactHtml: null,
    provider: result.provider,
    modelName: result.modelName,
    generatedAt: Date.now(),
  })
}
