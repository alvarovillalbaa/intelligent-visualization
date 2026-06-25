import { describe, expect, it } from "vitest"

import { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } from "@/packages/domain/fixtures"
import { isDomainId, createDomainId } from "@/packages/domain/ids"
import { deckSourceToSlidesDocument, migrateVisualizationDocument } from "@/packages/domain/migrations"
import { contentHash } from "@/packages/domain/serialization"
import type { DeckSource } from "@/lib/types"

describe("domain model", () => {
  it("creates UUIDv7-compatible canonical IDs", () => {
    expect(isDomainId(createDomainId())).toBe(true)
  })

  it("validates all starter visualization kinds", () => {
    expect(migrateVisualizationDocument(createStarterCourseDocument()).kind).toBe("course")
    expect(migrateVisualizationDocument(createStarterSlidesDocument()).kind).toBe("slides")
    expect(migrateVisualizationDocument(createStarterReportDocument()).kind).toBe("report")
  })

  it("hashes equivalent documents deterministically", () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }))
  })

  it("migrates a legacy deck source into a slides visualization document", () => {
    const source: DeckSource = {
      title: "Legacy Deck",
      subtitle: "Subtitle",
      audience: "Founders",
      narrative: "Tell a concise story",
      summary: "Summary",
      seoTitle: "Legacy Deck SEO",
      seoDescription: "Legacy deck description",
      theme: {
        id: "theme",
        name: "Theme",
        mood: "calm",
        displayFont: "Geist",
        bodyFont: "Geist",
        background: "#ffffff",
        foreground: "#111111",
        accent: "#2563eb",
        accentSoft: "#dbeafe",
        card: "#ffffff",
        cardForeground: "#111111",
        border: "#cbd5e1",
        gradient: "none",
      },
      brand: {
        companyName: "Acme",
        tagline: "Ship",
        voice: "Clear",
        descriptors: [],
        palette: ["#2563eb"],
        logos: [],
      },
      cta: { label: "Go", href: "https://example.com", helperText: "Go now" },
      leadCapture: { enabled: false, headline: "", description: "", fields: [] },
      poll: { question: "Pick one", options: ["A", "B"] },
      slides: [
        {
          id: "slide-1",
          kicker: "One",
          title: "First",
          summary: "First summary",
          layout: "hero",
          blocks: [{ kind: "paragraph", text: "Hello" }],
          notes: "",
        },
      ],
    }

    const document = deckSourceToSlidesDocument(source)
    expect(document.kind).toBe("slides")
    expect(document.slides.items[0].id).toBe("slide-1")
    expect(document.engagement?.cta?.label).toBe("Go")
  })
})
