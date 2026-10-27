import { generateText, Output } from "ai"

import { resolveLanguageModel } from "@/lib/ai/provider-registry"
import { GenerationError } from "@/lib/ai/generation-errors"
import { courseGenSchema, reportGenSchema } from "@/lib/ai/schema"
import { resolveSourceContext, type ResolvedSourceContext } from "@/lib/ai/source-context"
import {
  courseGenToDocument,
  createCourseDraft,
  createReportDraft,
  reportGenToDocument,
} from "@/lib/visualization-drafts"
import type { CourseVisualizationDocument, ReportVisualizationDocument } from "@/packages/domain/entities"
import { migrateVisualizationDocument } from "@/packages/domain/migrations"
import type { GenerationInput } from "@/lib/types"

const KIND_GUIDANCE = {
  course: `
You are generating a self-paced mini course.
Structure the source material into modules and lessons a learner can move through in one sitting.
Every lesson needs a clear objective, a concise explanation, teaching blocks, and at least one practice check
(multiple-choice-check or free-recall-check) grounded in the source material. Prefer concrete examples from the
source over generic advice. Keep multiple-choice answerIndex pointing at the correct option.`,
  report: `
You are generating a decision-oriented report.
Open with the decision question and an executive summary, then support them with evidence blocks.
Use kpi blocks for headline numbers, chart blocks for trends or comparisons that appear in the source
(mark charts illustrative when you extrapolate), data-table for structured detail, and comparison or timeline
blocks where the source supports them. Every claim should trace back to the provided material.`,
} as const

function buildVisualizationPrompt(
  kind: "course" | "report",
  input: GenerationInput,
  sourceContext: ResolvedSourceContext | null,
) {
  const fileContext = input.files
    .map((file) => `File: ${file.name}\n${file.content.slice(0, 1600)}`)
    .join("\n\n")

  return `
${KIND_GUIDANCE[kind].trim()}

The result publishes as a standalone, responsive HTML document. Optimize for clarity, strong typography, and honest use of the source.

User prompt:
${input.prompt || "Create a polished visual document from this source."}

Input kind: ${input.inputKind}
Source URL: ${input.sourceUrl ?? "none"}

Raw content:
${input.rawText || "No pasted content provided."}

File context:
${fileContext || "No files uploaded."}

Scraped page content:
${sourceContext?.pageMarkdown?.slice(0, 3500) || "No page scrape available."}

Brand system:
${sourceContext?.brandSummary || "No structured brand kit available."}

If files include OCR or extracted document structure, use that structured context directly instead of treating files as opaque attachments.
  `.trim()
}

export async function generateVisualizationDocument(
  kind: "course" | "report",
  input: GenerationInput,
  options?: { requireAi?: boolean },
): Promise<{
  provider: string
  modelName: string
  document: CourseVisualizationDocument | ReportVisualizationDocument
}> {
  const resolved = resolveLanguageModel()
  const fallback = () => (kind === "course" ? createCourseDraft(input) : createReportDraft(input))

  if (!resolved) {
    if (options?.requireAi) throw new GenerationError("AI_UNAVAILABLE")
    return { provider: "fallback", modelName: "heuristic", document: fallback() }
  }

  const sourceContext = await resolveSourceContext(input)
  const prompt = buildVisualizationPrompt(kind, input, sourceContext)

  try {
    if (kind === "course") {
      const generated = await generateText({
        model: resolved.model,
        output: Output.object({
          schema: courseGenSchema,
          name: "course_document",
          description: "A mini course with modules, lessons, teaching blocks, and practice checks.",
        }),
        temperature: 0.7,
        prompt,
        ...(options?.requireAi ? { maxRetries: 0 } : {}),
      })

      const document = courseGenToDocument(generated.output, input)
      if (options?.requireAi) migrateVisualizationDocument(document)
      return {
        provider: resolved.provider,
        modelName: resolved.modelName,
        document,
      }
    }

    const generated = await generateText({
      model: resolved.model,
      output: Output.object({
        schema: reportGenSchema,
        name: "report_document",
        description: "A decision report with an executive summary and evidence blocks.",
      }),
      temperature: 0.7,
      prompt,
      ...(options?.requireAi ? { maxRetries: 0 } : {}),
    })

    const document = reportGenToDocument(generated.output, input)
    if (options?.requireAi) migrateVisualizationDocument(document)
    return {
      provider: resolved.provider,
      modelName: resolved.modelName,
      document,
    }
  } catch {
    if (options?.requireAi) throw new GenerationError("AI_GENERATION_FAILED")
    return { provider: "fallback", modelName: "heuristic", document: fallback() }
  }
}
