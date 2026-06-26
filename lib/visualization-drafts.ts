import { deckSourceToSlidesDocument } from "@/packages/domain/migrations"
import {
  createStarterCourseDocument,
  createStarterReportDocument,
} from "@/packages/domain/fixtures"
import type { VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"
import type { DeckSource, GenerationInput } from "@/lib/types"

function sourceText(input: GenerationInput) {
  return [input.rawText, input.sourceUrl, ...input.files.map((file) => file.content)]
    .filter(Boolean)
    .join("\n\n")
}

function sourceTitle(input: GenerationInput) {
  const text = sourceText(input)
  const fromText = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 8)

  if (fromText) {
    return fromText.slice(0, 80)
  }

  if (input.sourceUrl) {
    try {
      return new URL(input.sourceUrl).hostname.replace(/^www\./, "")
    } catch {
      return input.sourceUrl.slice(0, 80)
    }
  }

  return input.files[0]?.name.replace(/\.[^.]+$/, "") || "Imported visualization"
}

function sourceSummary(input: GenerationInput) {
  const text = sourceText(input)
  const sentence = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .find((entry) => entry.trim().length > 40)

  return (
    sentence?.trim().slice(0, 220) ||
    input.prompt ||
    "A working draft generated from imported source material."
  )
}

function applyDocumentBasics<T extends VisualizationDocument>(document: T, input: GenerationInput): T {
  const title = sourceTitle(input)
  const summary = sourceSummary(input)

  return {
    ...document,
    title,
    summary,
    audience: "Imported audience",
    goal: input.prompt || document.goal,
    seo: {
      title,
      description: summary,
    },
    sourceManifest: [
      ...(input.rawText
        ? [
            {
              id: "pasted-source",
              label: "Pasted source",
              kind: "paste" as const,
              contentHash: "guest-local",
              provenance: "Guest import",
            },
          ]
        : []),
      ...(input.sourceUrl
        ? [
            {
              id: "source-url",
              label: input.sourceUrl,
              kind: "url" as const,
              contentHash: "guest-local",
              provenance: "Guest import",
            },
          ]
        : []),
      ...input.files.map((file, index) => ({
        id: `file-${index + 1}`,
        label: file.name,
        kind: "file" as const,
        contentHash: "guest-local",
        provenance: file.type || "Uploaded file",
      })),
    ],
  }
}

export function createCourseDraft(input: GenerationInput) {
  const document = applyDocumentBasics(createStarterCourseDocument(), input)
  const title = document.title
  const summary = document.summary

  return {
    ...document,
    course: {
      ...document.course,
      mission: input.prompt || `Teach the key ideas in ${title}.`,
      learningObjectives: [
        `Explain the key ideas in ${title}`,
        "Apply the source material through a short practice check",
      ],
      modules: document.course.modules.map((module, moduleIndex) => ({
        ...module,
        title: moduleIndex === 0 ? title : module.title,
        objective: summary,
        lessons: module.lessons.map((lesson) => ({
          ...lesson,
          title: title.slice(0, 72),
          objective: summary,
          explanation: summary,
          blocks: lesson.blocks.map((block) =>
            block.kind === "prose"
              ? {
                  ...block,
                  text: `${summary} Use the imported material as the teaching source for this lesson.`,
                }
              : block,
          ),
          summary,
        })),
      })),
    },
  }
}

export function createReportDraft(input: GenerationInput) {
  const document = applyDocumentBasics(createStarterReportDocument(), input)
  const title = document.title
  const summary = document.summary

  return {
    ...document,
    report: {
      ...document.report,
      decisionQuestion: input.prompt || "What should the reader decide after reviewing this imported material?",
      executiveSummary: summary,
      blocks: document.report.blocks.map((block) => {
        if (block.kind === "heading") {
          return { ...block, text: title }
        }
        if (block.kind === "rich-text") {
          return { ...block, text: summary }
        }
        return block
      }),
    },
  }
}

export function createSlidesDraft(source: DeckSource) {
  return deckSourceToSlidesDocument(source)
}

export function createVisualizationDraft(
  kind: VisualizationKind,
  input: GenerationInput,
  slidesSource?: DeckSource,
) {
  if (kind === "slides" && slidesSource) {
    return createSlidesDraft(slidesSource)
  }

  if (kind === "course") {
    return createCourseDraft(input)
  }

  if (kind === "report") {
    return createReportDraft(input)
  }

  throw new Error(`Unable to create ${kind} draft without slide source.`)
}
