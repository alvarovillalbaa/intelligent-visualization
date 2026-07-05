import { NextResponse } from "next/server"
import { z } from "zod"

import { streamDeckSource } from "@/lib/ai/generate-deck"
import { generationInputSchema } from "@/lib/ai/schema"
import type { DeckSource, GenerationInput } from "@/lib/types"

const requestSchema = z.object({
  generationInput: generationInputSchema,
  existingSource: z.any().optional(),
})

function sendLine(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(payload)}\n`))
}

function createPartial(source: DeckSource, slideCount: number) {
  return {
    ...source,
    slides: source.slides.slice(0, slideCount),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergePartial<T>(base: T, patch: unknown): T {
  if (Array.isArray(patch)) {
    return patch as T
  }

  if (!isObject(base) || !isObject(patch)) {
    return (patch as T) ?? base
  }

  const next: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    next[key] = key in next ? mergePartial(next[key], value) : value
  }
  return next as T
}

function isRenderablePartial(source: Partial<DeckSource>): source is DeckSource {
  return Boolean(
    source.title &&
      source.summary &&
      source.brand?.companyName &&
      source.theme &&
      Array.isArray(source.slides) &&
      source.slides.length,
  )
}

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json())

  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid generation payload." },
      { status: 400 },
    )
  }

  const generationInput: GenerationInput = body.data.existingSource
    ? {
        ...body.data.generationInput,
        rawText: `${body.data.generationInput.rawText}\n\nCurrent deck:\n${JSON.stringify(body.data.existingSource)}`,
      }
    : body.data.generationInput

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        sendLine(controller, { type: "status", message: "Normalizing input..." })
        const result = await streamDeckSource(generationInput)
        let latestPartial = {} as Partial<DeckSource>
        let latestSlideCount = 0

        sendLine(controller, { type: "status", message: "Drafting slide narrative..." })

        for await (const partial of result.partialObjectStream) {
          latestPartial = mergePartial(latestPartial, partial)

          if (!isRenderablePartial(latestPartial)) {
            continue
          }

          if (latestPartial.slides.length !== latestSlideCount) {
            latestSlideCount = latestPartial.slides.length
            sendLine(controller, {
              type: "partial",
              source: createPartial(latestPartial, latestSlideCount),
            })
          }
        }

        const finalObject = await result.finalObject
        sendLine(controller, {
          type: "final",
          source: finalObject,
          provider: result.provider,
          modelName: result.modelName,
        })
        controller.close()
      } catch (error) {
        sendLine(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "Unable to generate deck.",
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
    },
  })
}
