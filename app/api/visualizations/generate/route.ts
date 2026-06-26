import { NextResponse } from "next/server"
import { z } from "zod"

import { generateDeckSource } from "@/lib/ai/generate-deck"
import { createVisualizationDraft } from "@/lib/visualization-drafts"
import type { GenerationInput } from "@/lib/types"

const requestSchema = z.object({
  kind: z.enum(["slides", "course", "report"]),
  generationInput: z.object({
    inputKind: z.enum(["paste", "url", "files"]),
    rawText: z.string(),
    sourceUrl: z.string().optional(),
    prompt: z.string(),
    files: z.array(
      z.object({
        name: z.string(),
        content: z.string(),
        type: z.string(),
      }),
    ),
    themeMode: z.enum(["brand", "remix"]),
  }),
})

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return NextResponse.json({ error: "Invalid visualization generation payload." }, { status: 400 })
  }

  const generationInput = body.data.generationInput as GenerationInput
  const slideResult = body.data.kind === "slides" ? await generateDeckSource(generationInput) : null
  const document = createVisualizationDraft(body.data.kind, generationInput, slideResult?.object)

  return NextResponse.json({
    kind: body.data.kind,
    document,
    deckSource: slideResult?.object ?? null,
    provider: slideResult?.provider ?? "deterministic",
    modelName: slideResult?.modelName ?? "starter-document",
    generatedAt: Date.now(),
  })
}
