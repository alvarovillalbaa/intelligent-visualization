import { createDomainId } from "./ids"
import type {
  CourseVisualizationDocument,
  ReportVisualizationDocument,
  SlidesVisualizationDocument,
  VisualizationDocument,
} from "./entities"

export const starterTheme = {
  id: "neutral-editor",
  name: "Neutral Editor",
  mode: "light" as const,
  background: "#f8fafc",
  foreground: "#0f172a",
  accent: "#2563eb",
  muted: "#e2e8f0",
  border: "#cbd5e1",
  displayFont: "Geist, system-ui, sans-serif",
  bodyFont: "Geist, system-ui, sans-serif",
}

export const starterBrand = {
  companyName: "Intelligent Visualization",
  tagline: "Interactive visual documents.",
  voice: "Clear, precise, practical.",
  descriptors: ["structured", "accessible", "interactive"],
  palette: ["#2563eb", "#0f172a", "#f8fafc"],
  logos: [],
}

function base(kind: VisualizationDocument["kind"], title: string) {
  return {
    schemaVersion: 1,
    kind,
    title,
    summary: `${title} starter document.`,
    audience: "Internal team",
    goal: "Create a useful visual document without AI.",
    locale: "en-US",
    seo: {
      title,
      description: `${title} published as a standalone HTML artifact.`,
    },
    visualDirection: {
      layout: kind === "slides" ? "slide-mode" : kind === "course" ? "explainer" : "dashboard",
      style: "Product Brief",
      rationale: "A restrained default that is editable and readable before custom styling.",
    },
    theme: starterTheme,
    brand: starterBrand,
    sourceManifest: [],
    assetIds: [],
  }
}

export function createStarterCourseDocument(): CourseVisualizationDocument {
  const lessonId = createDomainId()
  return {
    ...base("course", "Starter Course"),
    kind: "course",
    course: {
      mission: "Help a learner understand one concept and practice it immediately.",
      learnerProfile: {
        level: "beginner",
        assumedKnowledge: [],
        goals: ["Understand the concept", "Complete a short practice check"],
        constraints: ["Keep the first lesson under ten minutes"],
      },
      estimatedMinutes: 8,
      learningObjectives: ["Explain the core idea in plain language"],
      prerequisites: [],
      modules: [
        {
          id: createDomainId(),
          title: "Module 1",
          objective: "Create a first tangible win.",
          lessons: [
            {
              id: lessonId,
              title: "First Lesson",
              objective: "Understand the starter concept.",
              estimatedMinutes: 8,
              prerequisiteIds: [],
              explanation: "A short explanation introduces the idea before practice.",
              blocks: [
                { id: createDomainId(), kind: "heading", text: "Start Here" },
                { id: createDomainId(), kind: "prose", text: "Use this lesson as a compact teaching unit." },
              ],
              practice: [
                {
                  id: createDomainId(),
                  kind: "multiple-choice-check",
                  prompt: "What should each lesson produce?",
                  options: ["A tangible win", "A certificate", "A payment record"],
                  answerIndex: 0,
                  explanation: "Courses in this product focus on useful progress, not LMS administration.",
                },
              ],
              feedback: "Answer the check, read the explanation, and continue.",
              summary: "You have a working starter lesson.",
              references: [],
            },
          ],
        },
      ],
      glossary: [{ id: createDomainId(), term: "Lesson", definition: "A focused learning unit with explanation and practice." }],
      references: [],
    },
  }
}

export function createStarterSlidesDocument(): SlidesVisualizationDocument {
  return {
    ...base("slides", "Starter Slides"),
    kind: "slides",
    engagement: {
      cta: {
        label: "Learn more",
        href: "https://example.com",
        helperText: "Replace this CTA before publishing.",
      },
    },
    slides: {
      aspectRatio: "16:9",
      navigation: "snap",
      items: [
        {
          id: createDomainId(),
          kicker: "Opening",
          title: "A title slide",
          summary: "Frame the audience and purpose.",
          layout: "hero",
          blocks: [{ kind: "paragraph", text: "Start from a concise narrative." }],
          notes: "Introduce the topic.",
        },
        {
          id: createDomainId(),
          kicker: "Body",
          title: "A content slide",
          summary: "Make one clear point.",
          layout: "split",
          blocks: [{ kind: "bullets", items: ["One idea", "One proof point", "One transition"] }],
          notes: "Keep the slide focused.",
        },
        {
          id: createDomainId(),
          kicker: "Close",
          title: "A closing slide",
          summary: "End with a clear next step.",
          layout: "cta",
          blocks: [{ kind: "callout", label: "Next", value: "Replace with the desired action." }],
          notes: "Close with a specific ask.",
        },
      ],
    },
  }
}

export function createStarterReportDocument(): ReportVisualizationDocument {
  const headingId = createDomainId()
  const summaryId = createDomainId()
  const kpiId = createDomainId()
  const chartId = createDomainId()
  return {
    ...base("report", "Starter Report"),
    kind: "report",
    report: {
      decisionQuestion: "What should the reader decide after reviewing this report?",
      executiveSummary: "Replace this summary with the main conclusion.",
      blocks: [
        { id: headingId, kind: "heading", level: 1, text: "Starter Report" },
        { id: summaryId, kind: "rich-text", text: "This report combines narrative and dashboard-style evidence." },
        { id: kpiId, kind: "kpi", label: "Sample KPI", value: "42", detail: "Illustrative value", provenance: "Sample data" },
        {
          id: chartId,
          kind: "chart",
          chart: {
            id: createDomainId(),
            type: "bar",
            title: "Sample Chart",
            description: "Illustrative values for layout validation.",
            series: [{ key: "value", label: "Value", color: "#2563eb" }],
            data: [
              { label: "A", value: 12 },
              { label: "B", value: 18 },
              { label: "C", value: 10 },
            ],
            xKey: "label",
            source: "Starter template",
            provenance: "Illustrative sample data; replace before publication.",
            accessibleLabel: "Bar chart with illustrative values for A, B, and C.",
            illustrative: true,
          },
        },
      ],
      layouts: {
        lg: [
          { blockId: headingId, x: 0, y: 0, w: 12, h: 2 },
          { blockId: summaryId, x: 0, y: 2, w: 8, h: 3 },
          { blockId: kpiId, x: 8, y: 2, w: 4, h: 3 },
          { blockId: chartId, x: 0, y: 5, w: 12, h: 6 },
        ],
        md: [
          { blockId: headingId, x: 0, y: 0, w: 8, h: 2 },
          { blockId: summaryId, x: 0, y: 2, w: 8, h: 3 },
          { blockId: kpiId, x: 0, y: 5, w: 8, h: 3 },
          { blockId: chartId, x: 0, y: 8, w: 8, h: 6 },
        ],
        sm: [
          { blockId: headingId, x: 0, y: 0, w: 4, h: 2 },
          { blockId: summaryId, x: 0, y: 2, w: 4, h: 3 },
          { blockId: kpiId, x: 0, y: 5, w: 4, h: 3 },
          { blockId: chartId, x: 0, y: 8, w: 4, h: 6 },
        ],
      },
      dataSources: [{ id: createDomainId(), label: "Sample data", contentHash: "sample", rowCount: 3, provenance: "Starter template" }],
    },
  }
}
