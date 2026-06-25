import { createDomainId } from "./ids"
import { contentHash } from "./serialization"
import { visualizationDocumentSchema } from "./schemas"
import type { SlidesVisualizationDocument, VisualizationDocument } from "./entities"
import type { DeckSource } from "@/lib/types"

export const CURRENT_VISUALIZATION_SCHEMA_VERSION = 1

export function migrateVisualizationDocument(document: unknown): VisualizationDocument {
  const parsed = visualizationDocumentSchema.safeParse(document)
  if (!parsed.success) {
    throw new Error(`Invalid visualization document: ${parsed.error.message}`)
  }
  return parsed.data as VisualizationDocument
}

export function deckSourceToSlidesDocument(source: DeckSource): SlidesVisualizationDocument {
  const document: SlidesVisualizationDocument = {
    schemaVersion: CURRENT_VISUALIZATION_SCHEMA_VERSION,
    kind: "slides",
    title: source.title,
    subtitle: source.subtitle,
    summary: source.summary,
    audience: source.audience,
    goal: source.narrative,
    locale: "en-US",
    seo: {
      title: source.seoTitle,
      description: source.seoDescription,
    },
    visualDirection: {
      layout: "slide-mode",
      style: source.theme.name,
      rationale: "Migrated from the legacy deck source while preserving slide order and theme intent.",
    },
    theme: {
      id: source.theme.id,
      name: source.theme.name,
      mode: source.theme.background.startsWith("#0") ? "dark" : "light",
      background: source.theme.background,
      foreground: source.theme.foreground,
      accent: source.theme.accent,
      muted: source.theme.accentSoft,
      border: source.theme.border,
      displayFont: source.theme.displayFont,
      bodyFont: source.theme.bodyFont,
    },
    brand: source.brand,
    sourceManifest: [
      {
        id: createDomainId(),
        label: "Legacy deck source",
        kind: "paste",
        contentHash: contentHash(source),
        provenance: "Migrated from DeckSource",
      },
    ],
    assetIds: [],
    engagement: {
      cta: source.cta,
      leadCapture: source.leadCapture,
      poll: source.poll,
    },
    slides: {
      aspectRatio: "16:9",
      navigation: "snap",
      items: source.slides,
    },
  }

  return migrateVisualizationDocument(document) as SlidesVisualizationDocument
}
