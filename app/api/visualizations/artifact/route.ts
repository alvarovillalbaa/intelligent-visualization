import { NextResponse } from "next/server"
import { z } from "zod"

import { buildStandaloneDeckHtml } from "@/lib/deck-runtime"
import { compileVisualizationArtifact } from "@/lib/artifacts/compiler"
import { migrateVisualizationDocument } from "@/packages/domain/migrations"
import { slugify } from "@/lib/utils"
import type { DeckSource } from "@/lib/types"

const requestSchema = z.object({
  deckSource: z.record(z.string(), z.unknown()).optional(),
  document: z.unknown().optional(),
})

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null))

  if (!body.success || Object.hasOwn(body.data, "document") === Object.hasOwn(body.data, "deckSource")) {
    return NextResponse.json({ error: "Provide one visualization document or deck source.", code: "INVALID_ARTIFACT_INPUT" }, { status: 400 })
  }

  try {
    if (Object.hasOwn(body.data, "document")) {
      const document = migrateVisualizationDocument(body.data.document)
      const compiled = await compileVisualizationArtifact(document, {
        visualizationId: "draft-preview",
        versionId: "draft-preview",
        preview: true,
      })
      return NextResponse.json({ artifactHtml: compiled.html })
    }

    const source = body.data.deckSource as unknown as DeckSource
    if (typeof source.title !== "string" || !Array.isArray(source.slides) || !source.slides.length) {
      return NextResponse.json({ error: "Deck source is missing slides.", code: "INVALID_ARTIFACT_INPUT" }, { status: 400 })
    }
    const artifactHtml = buildStandaloneDeckHtml(source, slugify(source.title || "draft"), { preview: true })
    return NextResponse.json({ artifactHtml })
  } catch {
    return NextResponse.json({ error: "Unable to compile draft preview.", code: "INVALID_ARTIFACT_INPUT" }, { status: 400 })
  }
}
