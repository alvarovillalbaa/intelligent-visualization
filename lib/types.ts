export type Role = "admin" | "editor" | "viewer"
export type InputKind = "paste" | "url" | "files"
export type DeckStatus = "draft" | "preview" | "published" | "archived"
export type ReviewStatus = "open" | "approved" | "changes_requested"
export type ExperimentStatus = "draft" | "running" | "paused"
export type SlideLayout = "hero" | "split" | "stats" | "quote" | "timeline" | "cta"
export type AssetKind = "image" | "video" | "document" | "code"

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  teamId: string
  teamName: string
  teamSlug: string
  workspaceId: string
  workspaceSlug: string
}

export interface ThemeTokens {
  id: string
  name: string
  mood: string
  displayFont: string
  bodyFont: string
  background: string
  foreground: string
  accent: string
  accentSoft: string
  card: string
  cardForeground: string
  border: string
  gradient: string
}

export interface BrandProfile {
  companyName: string
  sourceUrl?: string
  tagline: string
  voice: string
  descriptors: string[]
  palette: string[]
  logos: string[]
  brandKit?: BrandKit
}

export interface BrandKit {
  source: "firecrawl" | "manual"
  extractedAt?: number
  fonts: string[]
  colors: Record<string, string>
  logos: string[]
  imagery: string[]
  notes: string[]
  taglines?: string[]
  audiences?: string[]
  personality?: string[]
  guidelines?: string[]
  differentiators?: string[]
  typography?: {
    display: string[]
    body: string[]
    mono: string[]
  }
  composition?: {
    layout: string[]
    spacing: string[]
    motion: string[]
  }
  components?: string[]
  raw?: Record<string, unknown>
}

export interface CTAButton {
  label: string
  href: string
  helperText: string
}

export interface LeadCaptureField {
  key: string
  label: string
  type: "text" | "email" | "textarea"
  required: boolean
  placeholder: string
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

export type SlideBlock =
  | {
      kind: "paragraph"
      text: string
    }
  | {
      kind: "bullets"
      items: string[]
    }
  | {
      kind: "stats"
      items: Array<{
        label: string
        value: string
        detail: string
      }>
    }
  | {
      kind: "quote"
      quote: string
      byline: string
    }
  | {
      kind: "timeline"
      items: Array<{
        label: string
        detail: string
      }>
    }
  | {
      kind: "code"
      language: string
      code: string
    }
  | {
      kind: "callout"
      label: string
      value: string
    }

export interface SlideDefinition {
  id: string
  kicker: string
  title: string
  summary: string
  layout: SlideLayout
  blocks: SlideBlock[]
  notes: string
}

export interface DeckSource {
  title: string
  subtitle: string
  audience: string
  narrative: string
  summary: string
  seoTitle: string
  seoDescription: string
  theme: ThemeTokens
  brand: BrandProfile
  cta: CTAButton
  leadCapture: LeadCaptureConfig
  poll: PollConfig
  slides: SlideDefinition[]
}

export interface DeckCheckpoint {
  id: string
  title: string
  summary: string
  prompt: string
  createdAt: number
  source: DeckSource
}

export interface DeckVersion {
  id: string
  label: string
  createdAt: number
  status: "preview" | "published"
  source: DeckSource
  artifactHtml: string
  artifactStorageKey?: string
  artifactUrl?: string
  passwordHash?: string
}

export interface ReviewComment {
  id: string
  authorName: string
  body: string
  createdAt: number
  slideId?: string
  status: "comment" | "resolved" | "suggestion"
  suggestedPrompt?: string
  parentCommentId?: string
  appliedAt?: number
}

export interface ReviewRequest {
  id: string
  token: string
  title: string
  createdAt: number
  status: ReviewStatus
  versionId: string
  comments: ReviewComment[]
}

export interface DeckAnalytics {
  views: number
  uniqueVisitors: number
  completionRate: number
  avgTimeSeconds: number
  ctaClicks: number
  leads: number
  slideViews: Record<string, number>
  pollVotes: Record<string, number>
  variantMetrics: Record<
    string,
    {
      views: number
      uniqueVisitors: number
      completions: number
      ctaClicks: number
      leads: number
      pollVotes: number
      avgTimeSeconds: number
    }
  >
}

export interface DeckExperiment {
  id: string
  name: string
  status: ExperimentStatus
  question: string
  variants: Array<{
    id: string
    label: string
    versionId: string
    weight: number
  }>
}

export interface AssetRecord {
  id: string
  kind: AssetKind
  title: string
  description: string
  url: string
  storageKey?: string
  contentType?: string
  sizeBytes?: number
}

export interface DeckRecord {
  id: string
  teamId: string
  workspaceId: string
  publicId: string
  slug: string
  title: string
  description: string
  status: DeckStatus
  createdAt: number
  updatedAt: number
  createdBy: string
  source: DeckSource
  checkpoints: DeckCheckpoint[]
  versions: DeckVersion[]
  publishedVersionId?: string
  reviewRequests: ReviewRequest[]
  analytics: DeckAnalytics
  assets: AssetRecord[]
  themeMode: "brand" | "remix"
  passwordProtected: boolean
  passwordHash?: string
  experiment?: DeckExperiment
}

export interface WorkspaceRecord {
  id: string
  teamId: string
  slug: string
  name: string
  description: string
  decks: DeckRecord[]
}

export interface TeamMemberRecord {
  userId: string
  name: string
  email: string
  role: Role
}

export interface TeamInviteRecord {
  id: string
  teamId: string
  workspaceId: string
  email: string
  invitedName: string
  role: Role
  token: string
  status: "pending" | "accepted" | "revoked"
  createdAt: number
  invitedByUserId: string
  acceptedAt?: number
 }

export interface TeamRecord {
  id: string
  slug: string
  name: string
  brand: BrandProfile
  workspaces: WorkspaceRecord[]
  members: TeamMemberRecord[]
  invites: TeamInviteRecord[]
}

export interface UserRecord {
  id: string
  name: string
  email: string
  passwordHash: string
  teamId: string
  workspaceId: string
  role: Role
  createdAt: number
}

export interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  createdAt: number
  expiresAt: number
}

export interface AnalyticsEvent {
  id: string
  deckId?: string
  versionId?: string
  publicId: string
  type: "view" | "slide_view" | "cta_click" | "lead_submit" | "poll_vote" | "deck_complete" | "session_end"
  slideId?: string
  value?: string
  createdAt: number
  visitorId: string
  durationMs?: number
}

export interface LeadRecord {
  id: string
  deckId?: string
  versionId?: string
  publicId: string
  createdAt: number
  payload: Record<string, string>
}

export interface DashboardData {
  sessionUser: SessionUser
  team: TeamRecord
  workspace: WorkspaceRecord
  decks: DeckRecord[]
}

export interface GenerationInput {
  inputKind: InputKind
  rawText: string
  sourceUrl?: string
  prompt: string
  files: Array<{
    name: string
    content: string
    type: string
  }>
  themeMode: "brand" | "remix"
  brandContext?: {
    brandKit?: BrandKit
    markdown?: string
  }
  themeOverride?: ThemeTokens
}

export interface PublicDeckView {
  team: TeamRecord
  deck: DeckRecord
  version: DeckVersion
  reviewMode?: boolean
}

export interface ReviewView {
  team: TeamRecord
  deck: DeckRecord
  review: ReviewRequest
  version: DeckVersion
}

export interface RepositoryState {
  users: UserRecord[]
  sessions: SessionRecord[]
  teams: TeamRecord[]
  workspaces: WorkspaceRecord[]
  decks: DeckRecord[]
  events: AnalyticsEvent[]
  leads: LeadRecord[]
  invites: TeamInviteRecord[]
}
