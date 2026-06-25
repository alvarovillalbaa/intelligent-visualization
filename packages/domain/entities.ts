export type VisualizationKind = "course" | "slides" | "report"
export type Role = "admin" | "editor" | "viewer"
export type VisualizationStatus = "draft" | "preview" | "published" | "archived"
export type ReviewStatus = "open" | "approved" | "changes_requested"
export type ExperimentStatus = "draft" | "running" | "paused" | "completed"

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface CTAConfig {
  label: string
  href: string
  helperText?: string
}

export interface LeadCaptureField {
  key: string
  label: string
  type: "text" | "email" | "textarea"
  required: boolean
  placeholder?: string
}

export interface LeadCaptureConfig {
  enabled: boolean
  headline: string
  description: string
  fields: LeadCaptureField[]
}

export interface PollConfig {
  question: string
  options: string[]
}

export interface VisualizationTheme {
  id: string
  name: string
  mode: "light" | "dark" | "system"
  background: string
  foreground: string
  accent: string
  muted: string
  border: string
  displayFont: string
  bodyFont: string
}

export interface BrandProfile {
  companyName: string
  sourceUrl?: string
  tagline: string
  voice: string
  descriptors: string[]
  palette: string[]
  logos: string[]
}

export interface SourceManifestEntry {
  id: string
  label: string
  kind: "paste" | "url" | "file" | "dataset"
  contentHash: string
  provenance: string
}

export interface VisualizationDocumentBase {
  schemaVersion: number
  kind: VisualizationKind
  title: string
  subtitle?: string
  summary: string
  audience: string
  goal: string
  locale: string
  seo: {
    title: string
    description: string
  }
  visualDirection: {
    layout: string
    style: string
    rationale: string
  }
  theme: VisualizationTheme
  brand: BrandProfile
  sourceManifest: SourceManifestEntry[]
  assetIds: string[]
  engagement?: {
    cta?: CTAConfig
    leadCapture?: LeadCaptureConfig
    poll?: PollConfig
  }
}

export type AnimationPreset =
  | "fade-up"
  | "stagger"
  | "draw-path"
  | "count-up"
  | "step-reveal"
  | "highlight"
  | "compare"
  | "state-transition"

export interface AnimationSpec {
  preset: AnimationPreset
  trigger: "enter" | "scroll" | "click" | "step"
  durationMs: number
  delayMs?: number
  reducedMotion: "disable" | "simplify"
}

export type CourseBlock =
  | { id: string; kind: "heading"; text: string }
  | { id: string; kind: "prose"; text: string }
  | { id: string; kind: "callout"; title: string; body: string }
  | { id: string; kind: "multiple-choice-check"; prompt: string; options: string[]; answerIndex: number; explanation: string }
  | { id: string; kind: "free-recall-check"; prompt: string; guidance: string }
  | { id: string; kind: "summary"; items: string[] }

export interface CourseLesson {
  id: string
  title: string
  objective: string
  estimatedMinutes: number
  prerequisiteIds: string[]
  explanation: string
  blocks: CourseBlock[]
  practice: CourseBlock[]
  feedback: string
  summary: string
  references: string[]
}

export interface CourseModule {
  id: string
  title: string
  objective: string
  lessons: CourseLesson[]
}

export interface GlossaryEntry {
  id: string
  term: string
  definition: string
}

export interface CourseReference {
  id: string
  title: string
  href: string
  note: string
}

export interface CourseVisualizationDocument extends VisualizationDocumentBase {
  kind: "course"
  course: {
    mission: string
    learnerProfile: {
      level: "beginner" | "intermediate" | "advanced" | "mixed"
      assumedKnowledge: string[]
      goals: string[]
      constraints: string[]
    }
    estimatedMinutes: number
    learningObjectives: string[]
    prerequisites: string[]
    modules: CourseModule[]
    glossary: GlossaryEntry[]
    references: CourseReference[]
  }
}

export type SlideLayout = "hero" | "split" | "stats" | "quote" | "timeline" | "cta"

export type SlideBlock =
  | { id?: string; kind: "paragraph"; text: string }
  | { id?: string; kind: "bullets"; items: string[] }
  | { id?: string; kind: "stats"; items: Array<{ label: string; value: string; detail: string }> }
  | { id?: string; kind: "quote"; quote: string; byline: string }
  | { id?: string; kind: "timeline"; items: Array<{ label: string; detail: string }> }
  | { id?: string; kind: "code"; language: string; code: string }
  | { id?: string; kind: "callout"; label: string; value: string }
  | { id?: string; kind: "image"; assetId: string; alt: string; caption?: string }
  | { id?: string; kind: "chart"; chartId: string }

export interface SlideDefinition {
  id: string
  kicker: string
  title: string
  summary: string
  layout: SlideLayout
  blocks: SlideBlock[]
  notes: string
  animation?: AnimationSpec
}

export interface SlidesVisualizationDocument extends VisualizationDocumentBase {
  kind: "slides"
  slides: {
    aspectRatio: "16:9" | "4:3" | "1:1"
    navigation: "snap" | "free-scroll"
    items: SlideDefinition[]
  }
}

export interface ChartSpec {
  id: string
  type: "line" | "bar" | "area" | "pie" | "donut" | "composed"
  title: string
  description: string
  series: Array<{ key: string; label: string; color?: string }>
  data: Array<Record<string, string | number | null>>
  xKey?: string
  source: string
  provenance: string
  accessibleLabel: string
  illustrative: boolean
}

export type ReportBlock =
  | { id: string; kind: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; kind: "rich-text"; text: string }
  | { id: string; kind: "callout"; title: string; body: string }
  | { id: string; kind: "quote"; quote: string; byline: string }
  | { id: string; kind: "divider" }
  | { id: string; kind: "kpi"; label: string; value: string; detail: string; provenance: string }
  | { id: string; kind: "chart"; chart: ChartSpec }
  | { id: string; kind: "data-table"; title: string; columns: string[]; rows: string[][]; provenance: string }
  | { id: string; kind: "tabs"; tabs: Array<{ id: string; label: string; blocks: ReportBlock[] }> }
  | { id: string; kind: "image"; assetId: string; alt: string; caption?: string }
  | { id: string; kind: "list"; items: string[] }
  | { id: string; kind: "timeline"; items: Array<{ label: string; detail: string }> }
  | { id: string; kind: "comparison"; columns: Array<{ label: string; body: string }> }
  | { id: string; kind: "source-note"; text: string }
  | { id: string; kind: "cta"; cta: CTAConfig }

export interface ReportLayoutItem {
  blockId: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  locked?: boolean
}

export interface ReportDataSourceSnapshot {
  id: string
  label: string
  contentHash: string
  rowCount?: number
  provenance: string
}

export interface ReportVisualizationDocument extends VisualizationDocumentBase {
  kind: "report"
  report: {
    decisionQuestion?: string
    executiveSummary?: string
    layouts: {
      lg: ReportLayoutItem[]
      md: ReportLayoutItem[]
      sm: ReportLayoutItem[]
    }
    blocks: ReportBlock[]
    dataSources: ReportDataSourceSnapshot[]
  }
}

export type VisualizationDocument =
  | CourseVisualizationDocument
  | SlidesVisualizationDocument
  | ReportVisualizationDocument

export interface VisualizationRecord {
  id: string
  teamId: string
  workspaceId: string
  publicId: string
  kind: VisualizationKind
  slug: string
  title: string
  description: string
  status: VisualizationStatus
  schemaVersion: number
  draftDocument: VisualizationDocument
  draftHash: string
  draftRevision: number
  themeMode: "brand" | "remix"
  createdBy: string
  createdAt: string
  updatedAt: string
  publishedVersionId: string | null
  passwordProtected: boolean
  passwordHash: string | null
}

export interface VisualizationVersion {
  id: string
  visualizationId: string
  label: string
  status: "preview" | "published"
  schemaVersion: number
  document: VisualizationDocument
  documentHash: string
  artifactStorageKey: string | null
  artifactUrl: string | null
  artifactHash: string | null
  manifest: Record<string, unknown>
  createdBy: string
  createdAt: string
  passwordHash: string | null
}

export interface ReviewAnchor {
  nodeKind:
    | "slide"
    | "course-module"
    | "course-lesson"
    | "course-block"
    | "report-block"
    | "visualization"
  nodeId: string
}

export interface ProviderHealth {
  ok: boolean
  message: string
  checkedAt: string
  details?: Record<string, unknown>
}
