import { describe, expect, it } from "vitest"

import { visualizationDocumentSchema } from "@/packages/domain/schemas"
import { courseGenSchema, reportGenSchema, type CourseGen, type ReportGen } from "@/lib/ai/schema"
import { courseGenToDocument, reportGenToDocument } from "@/lib/visualization-drafts"
import { themeLibrary } from "@/lib/deck-runtime"
import type { GenerationInput } from "@/lib/types"

const baseInput: GenerationInput = {
  inputKind: "url",
  rawText: "Quarterly results were strong.",
  sourceUrl: "https://example.com/results",
  prompt: "Create a polished visual document from this source.",
  files: [],
  themeMode: "brand",
}

const courseGen: CourseGen = {
  title: "Understanding the Quarter",
  summary: "A short course on the quarterly results.",
  audience: "New analysts",
  goal: "Explain the results",
  visualDirection: { layout: "explainer", style: "Editorial", rationale: "Readable and calm." },
  mission: "Teach the quarter's key drivers.",
  learnerProfile: {
    level: "beginner",
    assumedKnowledge: [],
    goals: ["Understand revenue drivers"],
    constraints: [],
  },
  estimatedMinutes: 12,
  learningObjectives: ["Explain revenue growth", "Identify the main risk"],
  prerequisites: [],
  modules: [
    {
      title: "Revenue",
      objective: "Understand the revenue story.",
      lessons: [
        {
          title: "Growth drivers",
          objective: "Name the two growth drivers.",
          estimatedMinutes: 6,
          explanation: "Revenue grew because of pricing and volume.",
          blocks: [
            { kind: "prose", text: "Pricing contributed most of the growth." },
            {
              kind: "multiple-choice-check",
              prompt: "What drove growth?",
              options: ["Pricing", "Headcount", "Weather", "Luck"],
              answerIndex: 7,
              explanation: "Pricing was the main driver.",
            },
          ],
          practice: [{ kind: "free-recall-check", prompt: "Summarize the quarter.", guidance: "Two sentences." }],
          feedback: "Review the explanation before moving on.",
          summary: "Pricing and volume drove growth.",
          references: [],
        },
      ],
    },
  ],
  glossary: [{ term: "ARR", definition: "Annual recurring revenue." }],
  references: [
    { title: "Results page", href: "https://example.com/results", note: "Primary source" },
    { title: "Broken link", href: "not-a-url", note: "Should be dropped" },
  ],
}

const reportGen: ReportGen = {
  title: "Quarterly Decision Brief",
  summary: "Whether to expand the sales team.",
  audience: "Leadership",
  goal: "Support the headcount decision",
  visualDirection: { layout: "dashboard", style: "Product Brief", rationale: "Evidence first." },
  decisionQuestion: "Should we expand sales?",
  executiveSummary: "Yes, the pipeline supports it.",
  blocks: [
    { kind: "heading", level: 1, text: "The case for expansion" },
    { kind: "rich-text", text: "Pipeline coverage is above target." },
    { kind: "kpi", label: "Coverage", value: "3.4x", detail: "Target is 3x", provenance: "CRM export" },
    {
      kind: "chart",
      chart: {
        type: "bar",
        title: "Pipeline by segment",
        description: "Coverage per segment.",
        series: [
          { key: "label", label: "Coverage" },
          { key: "target", label: "Target" },
        ],
        rows: [
          { label: "SMB", values: [3.1, 3] },
          { label: "Mid", values: [3.8, 3] },
        ],
        source: "CRM",
        provenance: "Export from CRM",
        accessibleLabel: "Bar chart of pipeline coverage by segment.",
        illustrative: false,
      },
    },
  ],
}

describe("course generation mapping", () => {
  it("produces a document that satisfies the canonical schema", () => {
    const parsedGen = courseGenSchema.parse(courseGen)
    const document = courseGenToDocument(parsedGen, baseInput)

    const validated = visualizationDocumentSchema.parse(document)
    expect(validated.kind).toBe("course")
  })

  it("clamps out-of-range answer indexes and drops invalid references", () => {
    const document = courseGenToDocument(courseGen, baseInput)
    const check = document.course.modules[0].lessons[0].blocks[1]

    expect(check.kind).toBe("multiple-choice-check")
    if (check.kind === "multiple-choice-check") {
      expect(check.answerIndex).toBe(3)
    }
    expect(document.course.references).toHaveLength(1)
  })

  it("applies the accepted theme override", () => {
    const document = courseGenToDocument(courseGen, { ...baseInput, themeOverride: themeLibrary[1] })

    expect(document.theme.accent).toBe(themeLibrary[1].accent)
    expect(document.theme.background).toBe(themeLibrary[1].background)
  })
})

describe("report generation mapping", () => {
  it("produces a document that satisfies the canonical schema", () => {
    const parsedGen = reportGenSchema.parse(reportGen)
    const document = reportGenToDocument(parsedGen, baseInput)

    const validated = visualizationDocumentSchema.parse(document)
    expect(validated.kind).toBe("report")
  })

  it("renames chart series keys that collide with the x-axis key", () => {
    const document = reportGenToDocument(reportGen, baseInput)
    const chartBlock = document.report.blocks.find((block) => block.kind === "chart")

    expect(chartBlock?.kind).toBe("chart")
    if (chartBlock?.kind === "chart") {
      expect(chartBlock.chart.xKey).toBe("label")
      expect(chartBlock.chart.series[0].key).toBe("series_1")
      expect(chartBlock.chart.data[0]).toMatchObject({ label: "SMB", series_1: 3.1, target: 3 })
    }
  })
})
