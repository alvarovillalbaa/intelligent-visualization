import type { BrandKit, DeckSource, ThemeTokens } from "@/lib/types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenStrings(item))
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) => flattenStrings(item))
  }

  return []
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function collectSections(value: unknown, keys: string[]) {
  const target = new Set(keys.map(normalizeKey))
  const matches: unknown[] = []

  function visit(entry: unknown) {
    if (!isRecord(entry)) {
      if (Array.isArray(entry)) {
        entry.forEach(visit)
      }
      return
    }

    for (const [key, child] of Object.entries(entry)) {
      if (target.has(normalizeKey(key))) {
        matches.push(child)
      }
      visit(child)
    }
  }

  visit(value)
  return matches
}

function collectStrings(value: unknown, keys: string[]) {
  return unique(collectSections(value, keys).flatMap((entry) => flattenStrings(entry)))
}

function extractColorMap(value: unknown, prefix = "") {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((result, entry, index) => {
      if (typeof entry === "string" && /^#|rgb|hsl/i.test(entry.trim())) {
        result[`${prefix || "palette"}_${index + 1}`] = entry.trim()
      } else if (isRecord(entry)) {
        const name = flattenStrings(entry.name ?? entry.label ?? entry.token)[0] ?? `${prefix || "palette"}_${index + 1}`
        const colorValue = flattenStrings(entry.value ?? entry.hex ?? entry.color ?? entry.rgb ?? entry.hsl)[0]
        if (colorValue && /^#|rgb|hsl/i.test(colorValue)) {
          result[normalizeKey(name)] = colorValue
        }
      }
      return result
    }, {})
  }

  if (!isRecord(value)) {
    return {}
  }

  return Object.entries(value).reduce<Record<string, string>>((result, [key, entry]) => {
    if (typeof entry === "string" && /^#|rgb|hsl/i.test(entry.trim())) {
      result[prefix ? `${prefix}_${normalizeKey(key)}` : normalizeKey(key)] = entry.trim()
      return result
    }

    if (Array.isArray(entry) || isRecord(entry)) {
      Object.assign(
        result,
        extractColorMap(entry, prefix ? `${prefix}_${normalizeKey(key)}` : normalizeKey(key)),
      )
    }

    return result
  }, {})
}

function extractBrandColors(branding: Record<string, unknown>) {
  const sources = [
    branding.colors,
    branding.palette,
    ...collectSections(branding, [
      "colorPalette",
      "brandColors",
      "visualIdentity",
      "visual_identity",
      "colors",
      "palette",
    ]),
  ]

  return sources.reduce<Record<string, string>>((result, entry) => {
    Object.assign(result, extractColorMap(entry))
    return result
  }, {})
}

function extractTypography(branding: Record<string, unknown>) {
  const sections = [
    branding.typography,
    ...collectSections(branding, ["typography", "fonts", "fontFamilies", "fontSystem"]),
  ]

  const display = unique(
    sections.flatMap((entry) =>
      collectStrings(entry, ["display", "heading", "headings", "title", "titles", "hero"]),
    ),
  )
  const body = unique(
    sections.flatMap((entry) =>
      collectStrings(entry, ["body", "paragraph", "copy", "text", "ui"]),
    ),
  )
  const mono = unique(
    sections.flatMap((entry) =>
      collectStrings(entry, ["mono", "monospace", "code"]),
    ),
  )
  const fonts = unique([...display, ...body, ...mono, ...sections.flatMap((entry) => flattenStrings(entry))])

  return {
    fonts,
    typography: {
      display,
      body,
      mono,
    },
  }
}

function extractComposition(branding: Record<string, unknown>) {
  return {
    layout: collectStrings(branding, ["layout", "grid", "composition", "structure"]),
    spacing: collectStrings(branding, ["spacing", "density", "rhythm", "padding"]),
    motion: collectStrings(branding, ["motion", "animation", "transitions"]),
  }
}

function pickFirstColor(colors: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const match = colors[normalizeKey(key)] ?? colors[key]
    if (match) {
      return match
    }
  }

  return Object.values(colors)[0]
}

function mixAlpha(color: string, alphaHex: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${alphaHex}`
  }

  return color
}

export interface FirecrawlBrandContext {
  markdown?: string
  brandKit?: BrandKit
}

export async function fetchFirecrawlBrandContext(sourceUrl: string) {
  if (!process.env.FIRECRAWL_API_KEY) {
    return null
  }

  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: sourceUrl,
      formats: ["markdown", "branding"],
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Firecrawl scrape failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as {
    success?: boolean
    data?: {
      markdown?: unknown
      branding?: unknown
    }
  }

  const markdown = typeof payload.data?.markdown === "string" ? payload.data.markdown : undefined
  const branding = payload.data?.branding

  if (!isRecord(branding)) {
    return {
      markdown,
    } satisfies FirecrawlBrandContext
  }

  const colors = extractBrandColors(branding)
  const { fonts, typography } = extractTypography(branding)
  const composition = extractComposition(branding)
  const logos = collectStrings(branding, [
    "logos",
    "logo",
    "brandAssets",
    "brand_assets",
    "wordmark",
    "symbol",
    "mark",
  ])
  const imagery = collectStrings(branding, [
    "images",
    "imagery",
    "illustrations",
    "photography",
    "screenshots",
    "productShots",
    "product_shots",
  ])
  const notes = collectStrings(branding, [
    "voice",
    "tone",
    "personality",
    "guidelines",
    "messaging",
    "positioning",
    "brandStory",
    "brand_story",
    "style",
  ])
  const taglines = collectStrings(branding, ["tagline", "taglines", "slogan", "slogans"])
  const audiences = collectStrings(branding, ["audience", "audiences", "targetAudience", "target_audience"])
  const personality = collectStrings(branding, ["personality", "traits", "adjectives", "toneDescriptors"])
  const guidelines = collectStrings(branding, ["guidelines", "dos", "donts", "principles"])
  const differentiators = collectStrings(branding, [
    "differentiators",
    "differentiation",
    "valueProps",
    "value_propositions",
    "strengths",
  ])
  const components = collectStrings(branding, [
    "components",
    "patterns",
    "uiPatterns",
    "ui_patterns",
    "iconography",
  ])

  return {
    markdown,
    brandKit: {
      source: "firecrawl",
      extractedAt: Date.now(),
      colors,
      fonts,
      logos,
      imagery,
      notes,
      taglines,
      audiences,
      personality,
      guidelines,
      differentiators,
      typography,
      composition,
      components,
      raw: branding,
    },
  } satisfies FirecrawlBrandContext
}

export function deriveThemeFromBrandKit(brandKit: BrandKit, baseTheme: ThemeTokens): ThemeTokens {
  const accent = pickFirstColor(brandKit.colors, ["primary", "accent", "brand", "cta"]) ?? baseTheme.accent
  const background = pickFirstColor(brandKit.colors, ["background", "surface", "canvas", "base"]) ?? baseTheme.background
  const foreground = pickFirstColor(brandKit.colors, ["foreground", "text", "copy", "ink"]) ?? baseTheme.foreground
  const card = pickFirstColor(brandKit.colors, ["card", "surface", "panel", "secondary"]) ?? baseTheme.card
  const border = pickFirstColor(brandKit.colors, ["border", "outline", "stroke", "divider"]) ?? baseTheme.border
  const displayFont = brandKit.typography?.display[0] ?? brandKit.fonts[0] ?? baseTheme.displayFont
  const bodyFont =
    brandKit.typography?.body[0] ??
    brandKit.fonts[1] ??
    brandKit.fonts[0] ??
    baseTheme.bodyFont
  const mood = brandKit.personality?.[0] ?? brandKit.notes[0] ?? baseTheme.mood

  return {
    ...baseTheme,
    displayFont,
    bodyFont,
    accent,
    accentSoft: mixAlpha(accent, "1f"),
    background,
    foreground,
    card,
    cardForeground: foreground,
    border,
    gradient: `linear-gradient(135deg, ${background} 0%, ${mixAlpha(accent, "26")} 42%, ${card} 100%)`,
    mood,
  }
}

export function hasUsableBrandStyle(brandKit: BrandKit | undefined | null): brandKit is BrandKit {
  return Boolean(brandKit && (Object.keys(brandKit.colors).length || brandKit.fonts.length))
}

export function applyBrandKitToSource(
  source: DeckSource,
  themeMode: "brand" | "remix",
  brandContext?: FirecrawlBrandContext | null,
  themeOverride?: ThemeTokens,
) {
  if (!source.theme || !source.brand || !Array.isArray(source.slides)) {
    return source
  }

  const brandKit = brandContext?.brandKit
  if (!brandKit && !themeOverride) {
    return source
  }

  const nextTheme: ThemeTokens =
    themeOverride ??
    (themeMode === "brand" && brandKit ? deriveThemeFromBrandKit(brandKit, source.theme) : source.theme)

  if (!brandKit) {
    return {
      ...source,
      theme: nextTheme,
    }
  }

  const descriptors = unique([
    ...(brandKit.personality ?? []),
    ...(brandKit.differentiators ?? []),
    ...(brandKit.notes ?? []),
    ...(source.brand.descriptors ?? []),
  ]).slice(0, 12)

  const voice =
    brandKit.notes[0] ??
    brandKit.personality?.slice(0, 3).join(", ") ??
    source.brand.voice

  return {
    ...source,
    theme: nextTheme,
    brand: {
      ...source.brand,
      sourceUrl: source.brand.sourceUrl,
      palette: unique([...Object.values(brandKit.colors), ...(source.brand.palette ?? [])]).slice(0, 8),
      logos: unique([...brandKit.logos, ...(source.brand.logos ?? [])]).slice(0, 8),
      descriptors,
      voice,
      tagline:
        source.brand.tagline ||
        brandKit.taglines?.[0] ||
        brandKit.notes[1] ||
        source.brand.companyName,
      brandKit,
    },
  }
}
