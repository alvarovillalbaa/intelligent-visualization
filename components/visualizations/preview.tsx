"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CoursePreview } from "@/components/visualizations/renderers/course-preview"
import { ReportPreview } from "@/components/visualizations/renderers/report-preview"
import { visualizationKindLabel } from "@/components/visualizations/options"
import type { GeneratedDraft } from "@/lib/client/guest-draft"

function isolatedPreviewHtml(html: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data: blob:; font-src data:; media-src https: data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">`
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + policy) : policy + html
}

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
  const [compileAttempt, setCompileAttempt] = useState(0)
  const compileBody = useMemo(() => draft.kind === "slides"
    ? JSON.stringify(draft.deckSource ? { deckSource: draft.deckSource } : { document: draft.document })
    : null, [draft.kind, draft.deckSource, draft.document])
  const isolatedHtml = useMemo(() => artifactHtml ? isolatedPreviewHtml(artifactHtml) : null, [artifactHtml])

  useEffect(() => {
    if (!compileBody || artifactHtml || compileFailed) {
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    fetch("/api/visualizations/artifact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: compileBody,
      signal: controller.signal,
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
          if (typeof payload.artifactHtml === "string" && payload.artifactHtml.trim()) setArtifactHtml(payload.artifactHtml)
          else setCompileFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompileFailed(true)
        }
      })
      .finally(() => clearTimeout(timer))

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [artifactHtml, compileFailed, compileBody, compileAttempt])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f7f5ef] text-[#171a17]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/8 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={onClose}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{draft.document.title}</p>
            <p className="text-xs text-muted-foreground">{visualizationKindLabel(draft.kind)}</p>
            {note ? <p className="mt-1 max-w-xl text-xs text-muted-foreground">{note}</p> : null}
          </div>
        </div>

        {showSignupCta ? (
          <Button nativeButton={false} render={<Link href="/auth?mode=signup&returnTo=/app" />} size="sm">
            Account options
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {draft.kind === "slides" ? (
          isolatedHtml ? (
            <iframe
              srcDoc={isolatedHtml}
              sandbox="allow-scripts"
              title={draft.document.title}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
              {compileFailed || !compileBody ? (
                <div className="space-y-3 p-5 text-center">
                  <p role="alert">The Slides preview could not be prepared. Your generated draft is still available.</p>
                  {compileBody ? <Button type="button" variant="outline" className="min-h-11" onClick={() => { setCompileFailed(false); setCompileAttempt((attempt) => attempt + 1) }}>Retry preview</Button> : null}
                  <p className="text-xs text-muted-foreground">Preview retry only renders this draft again; it does not generate a new draft.</p>
                </div>
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
