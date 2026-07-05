"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CoursePreview } from "@/components/visualizations/renderers/course-preview"
import { ReportPreview } from "@/components/visualizations/renderers/report-preview"
import { visualizationKindLabel } from "@/components/visualizations/options"
import type { GeneratedDraft } from "@/lib/client/guest-draft"

export function VisualizationPreview({
  draft,
  note,
  showSignupCta,
  onClose,
}: {
  draft: GeneratedDraft
  note?: string
  showSignupCta?: boolean
  onClose: () => void
}) {
  // Parents remount this component per draft (key), so initial state is enough.
  const [artifactHtml, setArtifactHtml] = useState(draft.artifactHtml ?? null)
  const [compileFailed, setCompileFailed] = useState(false)

  useEffect(() => {
    if (draft.kind !== "slides" || artifactHtml || compileFailed || !draft.deckSource) {
      return
    }

    let cancelled = false

    fetch("/api/visualizations/artifact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deckSource: draft.deckSource }),
    })
      .then(async (response) => {
        if (cancelled) {
          return
        }
        if (!response.ok) {
          setCompileFailed(true)
          return
        }
        const payload = (await response.json()) as { artifactHtml: string }
        if (!cancelled) {
          setArtifactHtml(payload.artifactHtml)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompileFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [artifactHtml, compileFailed, draft])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f7f5ef] text-[#171a17]">
      <div className="flex items-center justify-between gap-4 border-b border-black/8 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{draft.document.title}</p>
            <p className="text-xs text-muted-foreground">{visualizationKindLabel(draft.kind)}</p>
          </div>
        </div>

        {showSignupCta ? (
          <Button nativeButton={false} render={<Link href="/auth?mode=signup&returnTo=/app" />} size="sm">
            Sign up to keep this draft
          </Button>
        ) : note ? (
          <p className="text-xs text-muted-foreground">{note}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {draft.kind === "slides" ? (
          artifactHtml ? (
            <iframe
              srcDoc={artifactHtml}
              sandbox="allow-scripts"
              title={draft.document.title}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
              {compileFailed ? (
                "Unable to render this draft."
              ) : (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Preparing preview…
                </>
              )}
            </div>
          )
        ) : draft.document.kind === "course" ? (
          <CoursePreview document={draft.document} />
        ) : draft.document.kind === "report" ? (
          <ReportPreview document={draft.document} />
        ) : null}
      </div>
    </div>
  )
}
