import { nanoid } from "nanoid"
import { generateText, Output, streamText } from "ai"

import { applyBrandKitToSource, fetchFirecrawlBrandContext } from "@/lib/brand-kit"
import { remixTheme, themeLibrary } from "@/lib/deck-runtime"
import { deckSourceSchema } from "@/lib/ai/schema"
import { resolveLanguageModel, type ProviderKey } from "@/lib/ai/provider-registry"
import type { DeckSource, GenerationInput } from "@/lib/types"

function createFallbackDeck(
  input: GenerationInput,
  sourceContext?: {
    pageMarkdown?: string
  },
): DeckSource {
  const text = [input.rawText, input.sourceUrl, sourceContext?.pageMarkdown, ...input.files.map((file) => file.content)]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000)

  const headline = text.split(/\n+/).find(Boolean) ?? "Untitled narrative"
  const snippets = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 32)
    .slice(0, 8)

  const theme = input.themeMode === "remix" ? remixTheme(themeLibrary[1]) : themeLibrary[0]

  return {
    title: headline.slice(0, 72),
    subtitle: "A generated working draft",
    audience: "Internal stakeholders",
    narrative: input.prompt || "Turn raw notes into a presentation narrative.",
    summary: snippets[0] ?? "This draft deck was generated from the supplied source material.",
    seoTitle: headline.slice(0, 70),
    seoDescription: snippets[1] ?? "Generated from source content inside Slides.",
    brand: {
      companyName: input.sourceUrl
        ? new URL(input.sourceUrl).hostname.replace("www.", "")
        : "Slides",
      sourceUrl: input.sourceUrl,
      tagline: "Generated from your latest source material.",
      voice: "Clear, practical, and concise.",
      descriptors: ["structured", "editorial", "presentation-ready"],
      palette: [theme.accent, theme.foreground],
      logos: [],
    },
    theme,
    cta: {
      label: "Talk to the team",
      href: "https://example.com/demo",
      helperText: "Place the next step inside the deck instead of outside the workflow.",
    },
    leadCapture: {
      enabled: true,
      headline: "Capture follow-up interest",
      description: "Use the deck itself as the handoff point.",
      fields: [
        {
          key: "name",
          label: "Name",
          type: "text",
          required: true,
          placeholder: "Taylor",
        },
        {
          key: "email",
          label: "Email",
          type: "email",
          required: true,
          placeholder: "taylor@company.com",
        },
      ],
    },
    poll: {
      question: "What should be improved first?",
      options: ["Story arc", "Design system", "CTA placement"],
    },
    slides: [
      {
        id: nanoid(8),
        kicker: "Source pulse",
        title: headline.slice(0, 84),
        summary: snippets[0] ?? "This slide condenses the source material into a headline.",
        layout: "hero",
        blocks: [
          {
            kind: "paragraph",
            text: snippets[0] ?? "Use this hero slide to orient the audience around the main argument.",
          },
          {
            kind: "bullets",
            items: snippets.slice(1, 4).map((item) => item.slice(0, 120)).concat(
              snippets.length < 4
                ? ["Add a product proof point.", "Define the audience and CTA."]
                : [],
            ),
          },
        ],
        notes: "Rewrite the hero if you want a stronger executive framing.",
      },
      {
        id: nanoid(8),
        kicker: "What matters",
        title: "Convert raw information into a deck structure that can still evolve.",
        summary: "Keep authoring source editable after generation so teams can prompt, refine, and publish without rebuilds.",
        layout: "split",
        blocks: [
          {
            kind: "stats",
            items: [
              {
                label: "Input modes",
                value: String(Math.max(1, (input.rawText ? 1 : 0) + (input.sourceUrl ? 1 : 0) + (input.files.length ? 1 : 0))),
                detail: "Combined inside one generation request.",
              },
              {
                label: "Captured snippets",
                value: String(snippets.length || 3),
                detail: "Source lines used to draft the first narrative.",
              },
              {
                label: "Prompt mode",
                value: input.themeMode === "remix" ? "Remix" : "Brand",
                detail: "Theme generation mode selected by the editor.",
              },
            ],
          },
        ],
        notes: "This slide explains the authoring loop, not just the AI call.",
      },
      {
        id: nanoid(8),
        kicker: "Narrative arc",
        title: "A good first draft should already know where the deck is going.",
        summary: "Map the message, evidence, and call to action before styling details.",
        layout: "timeline",
        blocks: [
          {
            kind: "timeline",
            items: [
              {
                label: "Frame the problem",
                detail: "Start with the friction or opportunity in the source.",
              },
              {
                label: "Prove the argument",
                detail: "Use supporting snippets, numbers, and customer language.",
              },
              {
                label: "End with an action",
                detail: "Embed CTA and lead capture inside the deck.",
              },
            ],
          },
        ],
        notes: "A three-part arc keeps the first iteration coherent.",
      },
      {
        id: nanoid(8),
        kicker: "Close",
        title: "Ship the deck as a hosted artifact, not a screenshot export.",
        summary: "The deck should support versioning, analytics, embeds, password gating, and review links.",
        layout: "cta",
        blocks: [
          {
            kind: "quote",
            quote: input.prompt || "Use this last slide to anchor the next product or sales motion.",
            byline: "Prompt seed",
          },
          {
            kind: "callout",
            label: "Next action",
            value: "Publish a version, share a review link, or start an A/B test.",
          },
        ],
        notes: "Tighten CTA language after the core narrative is stable.",
      },
    ],
  }
}

function buildPrompt(
  input: GenerationInput,
  sourceContext?: {
    pageMarkdown?: string
    brandSummary?: string
  },
) {
  const fileContext = input.files
    .map((file) => `File: ${file.name}\n${file.content.slice(0, 1600)}`)
    .join("\n\n")

  return `
You are generating a code-based presentation deck.
Create a polished but concise narrative for an audience that will publish as a standalone HTML slide document.
Optimize for full-screen sections, minimal overflow, strong typography, clear side panels, and a final CTA / lead-capture moment.

User prompt:
${input.prompt || "Create a crisp, well-structured deck."}

Input kind: ${input.inputKind}
Source URL: ${input.sourceUrl ?? "none"}
Theme mode: ${input.themeMode}

Raw content:
${input.rawText || "No pasted content provided."}

File context:
${fileContext || "No files uploaded."}

Scraped page content:
${sourceContext?.pageMarkdown?.slice(0, 3500) || "No page scrape available."}

Brand system:
${sourceContext?.brandSummary || "No structured brand kit available."}

If files include OCR or extracted document structure, use that structured context directly instead of treating files as opaque attachments.
  `.trim()
}

async function resolveSourceContext(input: GenerationInput) {
  if (!input.sourceUrl) {
    return null
  }

  try {
    const firecrawl = await fetchFirecrawlBrandContext(input.sourceUrl)
    return {
      firecrawl,
      pageMarkdown: firecrawl?.markdown,
      brandSummary: firecrawl?.brandKit
        ? JSON.stringify({
            colors: firecrawl.brandKit.colors,
            fonts: firecrawl.brandKit.fonts,
            typography: firecrawl.brandKit.typography,
            taglines: firecrawl.brandKit.taglines,
            audiences: firecrawl.brandKit.audiences,
            personality: firecrawl.brandKit.personality,
            guidelines: firecrawl.brandKit.guidelines,
            differentiators: firecrawl.brandKit.differentiators,
            composition: firecrawl.brandKit.composition,
            components: firecrawl.brandKit.components,
            notes: firecrawl.brandKit.notes,
            logos: firecrawl.brandKit.logos,
            imagery: firecrawl.brandKit.imagery,
          })
        : undefined,
    }
  } catch {
    return null
  }
}

export async function generateDeckSource(input: GenerationInput, options?: {
  provider?: ProviderKey
  model?: string
}) {
  const resolved = resolveLanguageModel(options?.provider, options?.model)
  const sourceContext = await resolveSourceContext(input)

  if (!resolved) {
    const fallback = createFallbackDeck(input, sourceContext ? { pageMarkdown: sourceContext.pageMarkdown } : undefined)
    return {
      provider: "fallback" as const,
      modelName: "heuristic",
      object: applyBrandKitToSource(fallback, input.themeMode, sourceContext?.firecrawl),
    }
  }

  const generated = await generateText({
    model: resolved.model,
    output: Output.object({
      schema: deckSourceSchema,
      name: "deck_source",
      description:
        "A polished slide deck with brand details, CTA, lead capture, poll, and 4-8 slides.",
    }),
    temperature: 0.8,
    prompt: buildPrompt(input, sourceContext ? {
      pageMarkdown: sourceContext.pageMarkdown,
      brandSummary: sourceContext.brandSummary,
    } : undefined),
  })

  return {
    provider: resolved.provider,
    modelName: resolved.modelName,
    object: applyBrandKitToSource(generated.output, input.themeMode, sourceContext?.firecrawl),
  }
}

export async function streamDeckSource(
  input: GenerationInput,
  options?: { provider?: ProviderKey; model?: string },
) {
  const resolved = resolveLanguageModel(options?.provider, options?.model)
  const sourceContext = await resolveSourceContext(input)

  if (!resolved) {
    const fallback = applyBrandKitToSource(
      createFallbackDeck(input, sourceContext ? { pageMarkdown: sourceContext.pageMarkdown } : undefined),
      input.themeMode,
      sourceContext?.firecrawl,
    )
    return {
      provider: "fallback" as const,
      modelName: "heuristic",
      partialObjectStream: (async function* () {
        yield fallback
      })(),
      finalObject: Promise.resolve(fallback),
    }
  }

  const result = streamText({
    model: resolved.model,
    output: Output.object({
      schema: deckSourceSchema,
      name: "deck_source",
      description:
        "A polished slide deck with brand details, CTA, lead capture, poll, and 4-8 slides.",
    }),
    temperature: 0.8,
    prompt: buildPrompt(input, sourceContext ? {
      pageMarkdown: sourceContext.pageMarkdown,
      brandSummary: sourceContext.brandSummary,
    } : undefined),
  })

  return {
    provider: resolved.provider,
    modelName: resolved.modelName,
    partialObjectStream: (async function* () {
      for await (const partial of result.partialOutputStream) {
        yield applyBrandKitToSource(partial as DeckSource, input.themeMode, sourceContext?.firecrawl)
      }
    })(),
    finalObject: result.output.then((object) =>
      applyBrandKitToSource(object, input.themeMode, sourceContext?.firecrawl),
    ),
  }
}
