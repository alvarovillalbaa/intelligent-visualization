"use client"

import { CheckIcon, Loader2Icon, ShuffleIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ThemeTokens } from "@/lib/types"
import { cn } from "@/lib/utils"

function firstFontName(fontStack: string) {
  const first = fontStack.split(",")[0]?.trim() ?? fontStack
  return first.replace(/^["']|["']$/g, "")
}

export function StylePanel({
  domain,
  loading,
  candidate,
  logo,
  decision,
  onUse,
  onShuffle,
  onSkip,
}: {
  domain: string
  loading: boolean
  candidate: ThemeTokens | null
  logo?: string
  decision: "accepted" | "shuffled" | null
  onUse: () => void
  onShuffle: () => void
  onSkip: () => void
}) {
  if (loading) {
    return (
      <section className="flex items-center gap-3 rounded-lg bg-white p-5 text-sm text-muted-foreground shadow-sm">
        <Loader2Icon className="size-4 animate-spin" />
        Reading the style of {domain}…
      </section>
    )
  }

  if (!candidate) {
    return null
  }

  const swatches: Array<{ label: string; value: string }> = [
    { label: "Background", value: candidate.background },
    { label: "Text", value: candidate.foreground },
    { label: "Accent", value: candidate.accent },
    { label: "Card", value: candidate.card },
    { label: "Border", value: candidate.border },
  ]

  return (
    <section
      className={cn(
        "grid gap-4 rounded-lg bg-white p-5 shadow-sm transition",
        decision ? "ring-2 ring-[#111513]" : null,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-8 rounded-md object-contain" />
          ) : null}
          <div>
            <p className="text-sm font-medium">Style from {domain}</p>
            <p className="text-xs text-muted-foreground">
              {firstFontName(candidate.displayFont)} · {firstFontName(candidate.bodyFont)}
            </p>
          </div>
        </div>
        {decision ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium">
            <CheckIcon className="size-3.5" />
            {decision === "accepted" ? "Using this style" : "Using shuffled style"}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {swatches.map((swatch) => (
          <span key={swatch.label} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-6 rounded-full border border-black/10"
              style={{ backgroundColor: swatch.value }}
            />
            {swatch.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onUse}>
          Use this style
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onShuffle}>
          <ShuffleIcon data-icon="inline-start" />
          Shuffle
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </section>
  )
}
