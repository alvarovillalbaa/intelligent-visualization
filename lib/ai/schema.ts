import { z } from "zod"

export const themeTokensSchema = z.object({
  id: z.string(),
  name: z.string(),
  mood: z.string(),
  displayFont: z.string(),
  bodyFont: z.string(),
  background: z.string(),
  foreground: z.string(),
  accent: z.string(),
  accentSoft: z.string(),
  card: z.string(),
  cardForeground: z.string(),
  border: z.string(),
  gradient: z.string(),
})

export const brandKitSchema = z.object({
  source: z.enum(["firecrawl", "manual"]),
  extractedAt: z.number().optional(),
  fonts: z.array(z.string()).default([]),
  colors: z.record(z.string(), z.string()).default({}),
  logos: z.array(z.string()).default([]),
  imagery: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  taglines: z.array(z.string()).default([]),
  audiences: z.array(z.string()).default([]),
  personality: z.array(z.string()).default([]),
  guidelines: z.array(z.string()).default([]),
  differentiators: z.array(z.string()).default([]),
  typography: z
    .object({
      display: z.array(z.string()).default([]),
      body: z.array(z.string()).default([]),
      mono: z.array(z.string()).default([]),
    })
    .optional(),
  composition: z
    .object({
      layout: z.array(z.string()).default([]),
      spacing: z.array(z.string()).default([]),
      motion: z.array(z.string()).default([]),
    })
    .optional(),
  components: z.array(z.string()).default([]),
})

export const generationInputSchema = z.object({
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
  themeMode: z.enum(["brand", "remix"]).default("brand"),
  brandContext: z
    .object({
      brandKit: brandKitSchema.optional(),
      markdown: z.string().optional(),
    })
    .optional(),
  themeOverride: themeTokensSchema.optional(),
})

export const slideBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paragraph"),
    text: z.string(),
  }),
  z.object({
    kind: z.literal("bullets"),
    items: z.array(z.string()).min(2).max(6),
  }),
  z.object({
    kind: z.literal("stats"),
    items: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          detail: z.string(),
        }),
      )
      .min(2)
      .max(4),
  }),
  z.object({
    kind: z.literal("quote"),
    quote: z.string(),
    byline: z.string(),
  }),
  z.object({
    kind: z.literal("timeline"),
    items: z
      .array(
        z.object({
          label: z.string(),
          detail: z.string(),
        }),
      )
      .min(2)
      .max(5),
  }),
  z.object({
    kind: z.literal("code"),
    language: z.string(),
    code: z.string(),
  }),
  z.object({
    kind: z.literal("callout"),
    label: z.string(),
    value: z.string(),
  }),
])

export const deckSourceSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  audience: z.string(),
  narrative: z.string(),
  summary: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  brand: z.object({
    companyName: z.string(),
    sourceUrl: z.string().optional(),
    tagline: z.string(),
    voice: z.string(),
    descriptors: z.array(z.string()).default([]),
    palette: z.array(z.string()).default([]),
    logos: z.array(z.string()).default([]),
    brandKit: brandKitSchema.optional(),
  }),
  theme: themeTokensSchema,
  cta: z.object({
    label: z.string(),
    href: z.string(),
    helperText: z.string(),
  }),
  leadCapture: z.object({
    enabled: z.boolean(),
    headline: z.string(),
    description: z.string(),
    fields: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["text", "email", "textarea"]),
        required: z.boolean(),
        placeholder: z.string(),
      }),
    ),
  }),
  poll: z.object({
    question: z.string(),
    options: z.array(z.string()).min(2).max(4),
  }),
  slides: z
    .array(
      z.object({
        id: z.string(),
        kicker: z.string(),
        title: z.string(),
        summary: z.string(),
        layout: z.enum(["hero", "split", "stats", "quote", "timeline", "cta"]),
        blocks: z.array(slideBlockSchema).min(1).max(4),
        notes: z.string(),
      }),
    )
    .min(4)
    .max(8),
})

export type DeckSourceSchema = z.infer<typeof deckSourceSchema>

const visualDirectionGenSchema = z.object({
  layout: z.string(),
  style: z.string(),
  rationale: z.string(),
})

export const courseGenBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), text: z.string() }),
  z.object({ kind: z.literal("prose"), text: z.string() }),
  z.object({ kind: z.literal("callout"), title: z.string(), body: z.string() }),
  z.object({
    kind: z.literal("multiple-choice-check"),
    prompt: z.string(),
    options: z.array(z.string()).min(2).max(5),
    answerIndex: z.number().int().min(0),
    explanation: z.string(),
  }),
  z.object({ kind: z.literal("free-recall-check"), prompt: z.string(), guidance: z.string() }),
  z.object({ kind: z.literal("summary"), items: z.array(z.string()).min(2).max(6) }),
])

export const courseGenSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  summary: z.string(),
  audience: z.string(),
  goal: z.string(),
  visualDirection: visualDirectionGenSchema,
  mission: z.string(),
  learnerProfile: z.object({
    level: z.enum(["beginner", "intermediate", "advanced", "mixed"]),
    assumedKnowledge: z.array(z.string()).max(5),
    goals: z.array(z.string()).min(1).max(5),
    constraints: z.array(z.string()).max(4),
  }),
  estimatedMinutes: z.number().int().min(3).max(240),
  learningObjectives: z.array(z.string()).min(2).max(6),
  prerequisites: z.array(z.string()).max(5),
  modules: z
    .array(
      z.object({
        title: z.string(),
        objective: z.string(),
        lessons: z
          .array(
            z.object({
              title: z.string(),
              objective: z.string(),
              estimatedMinutes: z.number().int().min(1).max(120),
              explanation: z.string(),
              blocks: z.array(courseGenBlockSchema).min(1).max(6),
              practice: z.array(courseGenBlockSchema).max(3),
              feedback: z.string(),
              summary: z.string(),
              references: z.array(z.string()).max(4),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .min(1)
    .max(5),
  glossary: z.array(z.object({ term: z.string(), definition: z.string() })).max(8),
  references: z.array(z.object({ title: z.string(), href: z.string(), note: z.string() })).max(6),
})

export type CourseGen = z.infer<typeof courseGenSchema>

const chartGenSchema = z.object({
  type: z.enum(["line", "bar", "area", "pie", "donut"]),
  title: z.string(),
  description: z.string(),
  series: z.array(z.object({ key: z.string(), label: z.string() })).min(1).max(4),
  rows: z
    .array(
      z.object({
        label: z.string(),
        values: z.array(z.number()).min(1).max(4),
      }),
    )
    .min(2)
    .max(24),
  source: z.string(),
  provenance: z.string(),
  accessibleLabel: z.string(),
  illustrative: z.boolean(),
})

export const reportGenBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), level: z.number().int().min(1).max(3), text: z.string() }),
  z.object({ kind: z.literal("rich-text"), text: z.string() }),
  z.object({ kind: z.literal("callout"), title: z.string(), body: z.string() }),
  z.object({ kind: z.literal("quote"), quote: z.string(), byline: z.string() }),
  z.object({ kind: z.literal("kpi"), label: z.string(), value: z.string(), detail: z.string(), provenance: z.string() }),
  z.object({ kind: z.literal("chart"), chart: chartGenSchema }),
  z.object({
    kind: z.literal("data-table"),
    title: z.string(),
    columns: z.array(z.string()).min(2).max(6),
    rows: z.array(z.array(z.string()).min(1).max(6)).min(1).max(10),
    provenance: z.string(),
  }),
  z.object({ kind: z.literal("list"), items: z.array(z.string()).min(2).max(8) }),
  z.object({
    kind: z.literal("timeline"),
    items: z.array(z.object({ label: z.string(), detail: z.string() })).min(2).max(6),
  }),
  z.object({
    kind: z.literal("comparison"),
    columns: z.array(z.object({ label: z.string(), body: z.string() })).min(2).max(3),
  }),
  z.object({ kind: z.literal("source-note"), text: z.string() }),
])

export const reportGenSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  summary: z.string(),
  audience: z.string(),
  goal: z.string(),
  visualDirection: visualDirectionGenSchema,
  decisionQuestion: z.string(),
  executiveSummary: z.string(),
  blocks: z.array(reportGenBlockSchema).min(4).max(14),
})

export type ReportGen = z.infer<typeof reportGenSchema>
