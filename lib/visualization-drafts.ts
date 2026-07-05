import { deckSourceToSlidesDocument } from "@/packages/domain/migrations"
import {
  createStarterCourseDocument,
  createStarterReportDocument,
  starterBrand,
  starterTheme,
} from "@/packages/domain/fixtures"
import { createDomainId } from "@/packages/domain/ids"
import type {
  ChartSpec,
  CourseBlock,
  CourseVisualizationDocument,
  ReportBlock,
  ReportVisualizationDocument,
  VisualizationDocument,
  VisualizationKind,
  VisualizationTheme,
} from "@/packages/domain/entities"
import type { CourseGen, ReportGen } from "@/lib/ai/schema"
import { urlDomain } from "@/lib/detect-urls"
import type { DeckSource, GenerationInput, ThemeTokens } from "@/lib/types"

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

export function themeTokensToVisualizationTheme(tokens: ThemeTokens): VisualizationTheme {
  return {
    id: tokens.id,
    name: tokens.name,
    mode: tokens.background.startsWith("#0") ? "dark" : "light",
    background: tokens.background,
    foreground: tokens.foreground,
    accent: tokens.accent,
    muted: tokens.accentSoft,
    border: tokens.border,
    displayFont: tokens.displayFont,
    bodyFont: tokens.bodyFont,
  }
}

function documentTheme(input: GenerationInput): VisualizationTheme {
  return input.themeOverride ? themeTokensToVisualizationTheme(input.themeOverride) : starterTheme
}

function documentBrand(input: GenerationInput) {
  const brandKit = input.brandContext?.brandKit
  const sourceUrl = input.sourceUrl

  if (!brandKit) {
    return { ...starterBrand, sourceUrl }
  }

  const descriptors = (brandKit.personality ?? []).slice(0, 6)

  return {
    companyName: sourceUrl ? urlDomain(sourceUrl) : starterBrand.companyName,
    sourceUrl,
    tagline: brandKit.taglines?.[0] ?? starterBrand.tagline,
    voice: brandKit.personality?.slice(0, 3).join(", ") || starterBrand.voice,
    descriptors: descriptors.length ? descriptors : starterBrand.descriptors,
    palette: Object.values(brandKit.colors).slice(0, 8),
    logos: brandKit.logos.slice(0, 4),
  }
}

function buildSourceManifest(input: GenerationInput) {
  return [
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
  ]
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
    theme: documentTheme(input),
    brand: documentBrand(input),
    sourceManifest: buildSourceManifest(input),
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

type CourseGenBlock = CourseGen["modules"][number]["lessons"][number]["blocks"][number]

function courseGenBlockToBlock(block: CourseGenBlock): CourseBlock {
  if (block.kind === "multiple-choice-check") {
    return {
      id: createDomainId(),
      kind: "multiple-choice-check",
      prompt: block.prompt,
      options: block.options,
      answerIndex: Math.min(block.answerIndex, block.options.length - 1),
      explanation: block.explanation,
    }
  }

  return { id: createDomainId(), ...block }
}

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function courseGenToDocument(gen: CourseGen, input: GenerationInput): CourseVisualizationDocument {
  return {
    schemaVersion: 1,
    kind: "course",
    title: gen.title,
    subtitle: gen.subtitle,
    summary: gen.summary,
    audience: gen.audience,
    goal: gen.goal,
    locale: "en-US",
    seo: {
      title: gen.title,
      description: gen.summary,
    },
    visualDirection: gen.visualDirection,
    theme: documentTheme(input),
    brand: documentBrand(input),
    sourceManifest: buildSourceManifest(input),
    assetIds: [],
    course: {
      mission: gen.mission,
      learnerProfile: gen.learnerProfile,
      estimatedMinutes: gen.estimatedMinutes,
      learningObjectives: gen.learningObjectives,
      prerequisites: gen.prerequisites,
      modules: gen.modules.map((module) => ({
        id: createDomainId(),
        title: module.title,
        objective: module.objective,
        lessons: module.lessons.map((lesson) => ({
          id: createDomainId(),
          title: lesson.title,
          objective: lesson.objective,
          estimatedMinutes: lesson.estimatedMinutes,
          prerequisiteIds: [],
          explanation: lesson.explanation,
          blocks: lesson.blocks.map(courseGenBlockToBlock),
          practice: lesson.practice.map(courseGenBlockToBlock),
          feedback: lesson.feedback,
          summary: lesson.summary,
          references: lesson.references,
        })),
      })),
      glossary: gen.glossary.map((entry) => ({ id: createDomainId(), ...entry })),
      references: gen.references
        .filter((reference) => isValidUrl(reference.href))
        .map((reference) => ({ id: createDomainId(), ...reference })),
    },
  }
}

type ReportGenBlock = ReportGen["blocks"][number]
type ChartGen = Extract<ReportGenBlock, { kind: "chart" }>["chart"]

function chartGenToSpec(chart: ChartGen): ChartSpec {
  const keys = chart.series.map((series, index) =>
    series.key && series.key !== "label" ? series.key : `series_${index + 1}`,
  )

  return {
    id: createDomainId(),
    type: chart.type,
    title: chart.title,
    description: chart.description,
    series: chart.series.map((series, index) => ({ key: keys[index], label: series.label })),
    data: chart.rows.map((row) => ({
      label: row.label,
      ...Object.fromEntries(keys.map((key, index) => [key, row.values[index] ?? 0])),
    })),
    xKey: "label",
    source: chart.source,
    provenance: chart.provenance,
    accessibleLabel: chart.accessibleLabel,
    illustrative: chart.illustrative,
  }
}

function reportGenBlockToBlock(block: ReportGenBlock): ReportBlock {
  if (block.kind === "heading") {
    return {
      id: createDomainId(),
      kind: "heading",
      level: (block.level <= 1 ? 1 : block.level === 2 ? 2 : 3) as 1 | 2 | 3,
      text: block.text,
    }
  }

  if (block.kind === "chart") {
    return { id: createDomainId(), kind: "chart", chart: chartGenToSpec(block.chart) }
  }

  return { id: createDomainId(), ...block }
}

export function reportGenToDocument(gen: ReportGen, input: GenerationInput): ReportVisualizationDocument {
  return {
    schemaVersion: 1,
    kind: "report",
    title: gen.title,
    subtitle: gen.subtitle,
    summary: gen.summary,
    audience: gen.audience,
    goal: gen.goal,
    locale: "en-US",
    seo: {
      title: gen.title,
      description: gen.summary,
    },
    visualDirection: gen.visualDirection,
    theme: documentTheme(input),
    brand: documentBrand(input),
    sourceManifest: buildSourceManifest(input),
    assetIds: [],
    report: {
      decisionQuestion: gen.decisionQuestion,
      executiveSummary: gen.executiveSummary,
      layouts: { lg: [], md: [], sm: [] },
      blocks: gen.blocks.map(reportGenBlockToBlock),
      dataSources: [],
    },
  }
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
