import { fetchFirecrawlBrandContext, type FirecrawlBrandContext } from "@/lib/brand-kit"
import type { BrandKit, GenerationInput } from "@/lib/types"

export interface ResolvedSourceContext {
  firecrawl: FirecrawlBrandContext | null
  pageMarkdown?: string
  brandSummary?: string
}

export function buildBrandSummary(brandKit: BrandKit | undefined | null) {
  if (!brandKit) {
    return undefined
  }

  return JSON.stringify({
    colors: brandKit.colors,
    fonts: brandKit.fonts,
    typography: brandKit.typography,
    taglines: brandKit.taglines,
    audiences: brandKit.audiences,
    personality: brandKit.personality,
    guidelines: brandKit.guidelines,
    differentiators: brandKit.differentiators,
    composition: brandKit.composition,
    components: brandKit.components,
    notes: brandKit.notes,
    logos: brandKit.logos,
    imagery: brandKit.imagery,
  })
}

export async function resolveSourceContext(input: GenerationInput): Promise<ResolvedSourceContext | null> {
  if (input.brandContext) {
    return {
      firecrawl: input.brandContext,
      pageMarkdown: input.brandContext.markdown,
      brandSummary: buildBrandSummary(input.brandContext.brandKit),
    }
  }

  if (!input.sourceUrl) {
    return null
  }

  try {
    const firecrawl = await fetchFirecrawlBrandContext(input.sourceUrl)
    return {
      firecrawl,
      pageMarkdown: firecrawl?.markdown,
      brandSummary: buildBrandSummary(firecrawl?.brandKit),
    }
  } catch {
    return null
  }
}
