import { describe, expect, it } from "vitest"

import { applyBrandKitToSource, deriveThemeFromBrandKit, hasUsableBrandStyle } from "@/lib/brand-kit"
import { themeLibrary } from "@/lib/deck-runtime"
import type { BrandKit, DeckSource, ThemeTokens } from "@/lib/types"

const brandKit: BrandKit = {
  source: "firecrawl",
  fonts: ["Inter", "Source Serif"],
  colors: {
    primary: "#635bff",
    background: "#0a2540",
    text: "#f6f9fc",
  },
  logos: ["https://example.com/logo.svg"],
  imagery: [],
  notes: ["Confident and technical"],
  typography: {
    display: ["Sohne"],
    body: ["Inter"],
    mono: [],
  },
}

function minimalSource(theme: ThemeTokens): DeckSource {
  return {
    title: "T",
    subtitle: "S",
    audience: "A",
    narrative: "N",
    summary: "Sum",
    seoTitle: "T",
    seoDescription: "D",
    theme,
    brand: {
      companyName: "Acme",
      tagline: "",
      voice: "",
      descriptors: [],
      palette: [],
      logos: [],
    },
    cta: { label: "Go", href: "https://example.com", helperText: "" },
    leadCapture: { enabled: false, headline: "", description: "", fields: [] },
    poll: { question: "Q", options: ["a", "b"] },
    slides: [],
  }
}

describe("deriveThemeFromBrandKit", () => {
  it("maps brand colors and fonts onto the base theme", () => {
    const derived = deriveThemeFromBrandKit(brandKit, themeLibrary[0])

    expect(derived.accent).toBe("#635bff")
    expect(derived.background).toBe("#0a2540")
    expect(derived.foreground).toBe("#f6f9fc")
    expect(derived.displayFont).toBe("Sohne")
    expect(derived.bodyFont).toBe("Inter")
  })

  it("keeps base values when the kit has no matching data", () => {
    const empty: BrandKit = { source: "manual", fonts: [], colors: {}, logos: [], imagery: [], notes: [] }
    const derived = deriveThemeFromBrandKit(empty, themeLibrary[0])

    expect(derived.accent).toBe(themeLibrary[0].accent)
    expect(derived.displayFont).toBe(themeLibrary[0].displayFont)
  })
})

describe("hasUsableBrandStyle", () => {
  it("accepts kits with colors or fonts and rejects empty kits", () => {
    expect(hasUsableBrandStyle(brandKit)).toBe(true)
    expect(
      hasUsableBrandStyle({ source: "manual", fonts: [], colors: {}, logos: [], imagery: [], notes: [] }),
    ).toBe(false)
    expect(hasUsableBrandStyle(undefined)).toBe(false)
  })
})

describe("applyBrandKitToSource", () => {
  it("uses the theme override verbatim when provided", () => {
    const override: ThemeTokens = { ...themeLibrary[1], id: "chosen", name: "Chosen" }
    const result = applyBrandKitToSource(minimalSource(themeLibrary[0]), "brand", { brandKit }, override)

    expect(result.theme.id).toBe("chosen")
    expect(result.theme.accent).toBe(themeLibrary[1].accent)
    // Brand profile still enriched from the kit.
    expect(result.brand.logos).toContain("https://example.com/logo.svg")
  })

  it("derives the theme from the kit in brand mode without an override", () => {
    const result = applyBrandKitToSource(minimalSource(themeLibrary[0]), "brand", { brandKit })

    expect(result.theme.accent).toBe("#635bff")
  })

  it("returns the source untouched without a kit or override", () => {
    const source = minimalSource(themeLibrary[0])

    expect(applyBrandKitToSource(source, "brand", null)).toBe(source)
  })
})
