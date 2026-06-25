import { z } from "zod"

export const visualizationKindSchema = z.enum(["course", "slides", "report"])

export const themeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(["light", "dark", "system"]),
  background: z.string().min(1),
  foreground: z.string().min(1),
  accent: z.string().min(1),
  muted: z.string().min(1),
  border: z.string().min(1),
  displayFont: z.string().min(1),
  bodyFont: z.string().min(1),
})

export const brandSchema = z.object({
  companyName: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  tagline: z.string(),
  voice: z.string(),
  descriptors: z.array(z.string()),
  palette: z.array(z.string()),
  logos: z.array(z.string()),
})

export const sourceManifestEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["paste", "url", "file", "dataset"]),
  contentHash: z.string().min(1),
  provenance: z.string().min(1),
})

export const ctaSchema = z.object({
  label: z.string().min(1),
  href: z.string().url(),
  helperText: z.string().optional(),
})

export const leadCaptureSchema = z.object({
  enabled: z.boolean(),
  headline: z.string(),
  description: z.string(),
  fields: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(["text", "email", "textarea"]),
      required: z.boolean(),
      placeholder: z.string().optional(),
    }),
  ),
})

export const pollSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
})

const documentBaseSchema = z.object({
  schemaVersion: z.number().int().positive(),
  kind: visualizationKindSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  summary: z.string().min(1),
  audience: z.string().min(1),
  goal: z.string().min(1),
  locale: z.string().min(2),
  seo: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
  }),
  visualDirection: z.object({
    layout: z.string().min(1),
    style: z.string().min(1),
    rationale: z.string().min(1),
  }),
  theme: themeSchema,
  brand: brandSchema,
  sourceManifest: z.array(sourceManifestEntrySchema),
  assetIds: z.array(z.string()),
  engagement: z
    .object({
      cta: ctaSchema.optional(),
      leadCapture: leadCaptureSchema.optional(),
      poll: pollSchema.optional(),
    })
    .optional(),
})

export const animationSchema = z.object({
  preset: z.enum([
    "fade-up",
    "stagger",
    "draw-path",
    "count-up",
    "step-reveal",
    "highlight",
    "compare",
    "state-transition",
  ]),
  trigger: z.enum(["enter", "scroll", "click", "step"]),
  durationMs: z.number().int().min(0).max(10000),
  delayMs: z.number().int().min(0).max(10000).optional(),
  reducedMotion: z.enum(["disable", "simplify"]),
})

const courseBlockSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("heading"), text: z.string() }),
  z.object({ id: z.string(), kind: z.literal("prose"), text: z.string() }),
  z.object({ id: z.string(), kind: z.literal("callout"), title: z.string(), body: z.string() }),
  z.object({
    id: z.string(),
    kind: z.literal("multiple-choice-check"),
    prompt: z.string(),
    options: z.array(z.string()).min(2),
    answerIndex: z.number().int().min(0),
    explanation: z.string(),
  }),
  z.object({ id: z.string(), kind: z.literal("free-recall-check"), prompt: z.string(), guidance: z.string() }),
  z.object({ id: z.string(), kind: z.literal("summary"), items: z.array(z.string()) }),
])

export const courseDocumentSchema = documentBaseSchema.extend({
  kind: z.literal("course"),
  course: z.object({
    mission: z.string().min(1),
    learnerProfile: z.object({
      level: z.enum(["beginner", "intermediate", "advanced", "mixed"]),
      assumedKnowledge: z.array(z.string()),
      goals: z.array(z.string()),
      constraints: z.array(z.string()),
    }),
    estimatedMinutes: z.number().int().positive(),
    learningObjectives: z.array(z.string()).min(1),
    prerequisites: z.array(z.string()),
    modules: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          objective: z.string(),
          lessons: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              objective: z.string(),
              estimatedMinutes: z.number().int().positive(),
              prerequisiteIds: z.array(z.string()),
              explanation: z.string(),
              blocks: z.array(courseBlockSchema),
              practice: z.array(courseBlockSchema),
              feedback: z.string(),
              summary: z.string(),
              references: z.array(z.string()),
            }),
          ),
        }),
      )
      .min(1),
    glossary: z.array(z.object({ id: z.string(), term: z.string(), definition: z.string() })),
    references: z.array(z.object({ id: z.string(), title: z.string(), href: z.string().url(), note: z.string() })),
  }),
})

const slideBlockSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().optional(), kind: z.literal("paragraph"), text: z.string() }),
  z.object({ id: z.string().optional(), kind: z.literal("bullets"), items: z.array(z.string()) }),
  z.object({
    id: z.string().optional(),
    kind: z.literal("stats"),
    items: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() })),
  }),
  z.object({ id: z.string().optional(), kind: z.literal("quote"), quote: z.string(), byline: z.string() }),
  z.object({
    id: z.string().optional(),
    kind: z.literal("timeline"),
    items: z.array(z.object({ label: z.string(), detail: z.string() })),
  }),
  z.object({ id: z.string().optional(), kind: z.literal("code"), language: z.string(), code: z.string() }),
  z.object({ id: z.string().optional(), kind: z.literal("callout"), label: z.string(), value: z.string() }),
  z.object({ id: z.string().optional(), kind: z.literal("image"), assetId: z.string(), alt: z.string(), caption: z.string().optional() }),
  z.object({ id: z.string().optional(), kind: z.literal("chart"), chartId: z.string() }),
])

export const slidesDocumentSchema = documentBaseSchema.extend({
  kind: z.literal("slides"),
  slides: z.object({
    aspectRatio: z.enum(["16:9", "4:3", "1:1"]),
    navigation: z.enum(["snap", "free-scroll"]),
    items: z
      .array(
        z.object({
          id: z.string(),
          kicker: z.string(),
          title: z.string(),
          summary: z.string(),
          layout: z.enum(["hero", "split", "stats", "quote", "timeline", "cta"]),
          blocks: z.array(slideBlockSchema),
          notes: z.string(),
          animation: animationSchema.optional(),
        }),
      )
      .min(1),
  }),
})

export const chartSpecSchema = z.object({
  id: z.string(),
  type: z.enum(["line", "bar", "area", "pie", "donut", "composed"]),
  title: z.string(),
  description: z.string(),
  series: z.array(z.object({ key: z.string(), label: z.string(), color: z.string().optional() })).min(1),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  xKey: z.string().optional(),
  source: z.string(),
  provenance: z.string(),
  accessibleLabel: z.string(),
  illustrative: z.boolean(),
})

export type ReportBlockInput = z.infer<typeof reportBlockSchema>

export const reportBlockSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ id: z.string(), kind: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: z.string() }),
    z.object({ id: z.string(), kind: z.literal("rich-text"), text: z.string() }),
    z.object({ id: z.string(), kind: z.literal("callout"), title: z.string(), body: z.string() }),
    z.object({ id: z.string(), kind: z.literal("quote"), quote: z.string(), byline: z.string() }),
    z.object({ id: z.string(), kind: z.literal("divider") }),
    z.object({ id: z.string(), kind: z.literal("kpi"), label: z.string(), value: z.string(), detail: z.string(), provenance: z.string() }),
    z.object({ id: z.string(), kind: z.literal("chart"), chart: chartSpecSchema }),
    z.object({ id: z.string(), kind: z.literal("data-table"), title: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())), provenance: z.string() }),
    z.object({ id: z.string(), kind: z.literal("tabs"), tabs: z.array(z.object({ id: z.string(), label: z.string(), blocks: z.array(reportBlockSchema) })).min(2) }),
    z.object({ id: z.string(), kind: z.literal("image"), assetId: z.string(), alt: z.string(), caption: z.string().optional() }),
    z.object({ id: z.string(), kind: z.literal("list"), items: z.array(z.string()) }),
    z.object({ id: z.string(), kind: z.literal("timeline"), items: z.array(z.object({ label: z.string(), detail: z.string() })) }),
    z.object({ id: z.string(), kind: z.literal("comparison"), columns: z.array(z.object({ label: z.string(), body: z.string() })).min(2) }),
    z.object({ id: z.string(), kind: z.literal("source-note"), text: z.string() }),
    z.object({ id: z.string(), kind: z.literal("cta"), cta: ctaSchema }),
  ]),
)

export const reportDocumentSchema = documentBaseSchema.extend({
  kind: z.literal("report"),
  report: z.object({
    decisionQuestion: z.string().optional(),
    executiveSummary: z.string().optional(),
    layouts: z.object({
      lg: z.array(z.object({ blockId: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), minW: z.number().optional(), minH: z.number().optional(), maxW: z.number().optional(), maxH: z.number().optional(), locked: z.boolean().optional() })),
      md: z.array(z.object({ blockId: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), minW: z.number().optional(), minH: z.number().optional(), maxW: z.number().optional(), maxH: z.number().optional(), locked: z.boolean().optional() })),
      sm: z.array(z.object({ blockId: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(), minW: z.number().optional(), minH: z.number().optional(), maxW: z.number().optional(), maxH: z.number().optional(), locked: z.boolean().optional() })),
    }),
    blocks: z.array(reportBlockSchema).min(1),
    dataSources: z.array(z.object({ id: z.string(), label: z.string(), contentHash: z.string(), rowCount: z.number().int().optional(), provenance: z.string() })),
  }),
})

export const visualizationDocumentSchema = z.discriminatedUnion("kind", [
  courseDocumentSchema,
  slidesDocumentSchema,
  reportDocumentSchema,
])
