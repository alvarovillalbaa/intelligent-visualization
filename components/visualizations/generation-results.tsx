"use client"

import Link from "next/link"
import { Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { visualizationKindLabel } from "@/components/visualizations/options"
import type { GenerationBatch } from "@/lib/client/generation-batch"
import type { GeneratedDraft } from "@/lib/client/guest-draft"

export function isExampleDraft(draft: GeneratedDraft) {
  return draft.provider.trim().toLowerCase() === "fallback" || draft.modelName.trim().toLowerCase() === "heuristic"
}

export function GenerationResults({
  batch,
  busy,
  workspaceSlug,
  onPreview,
  onRetry,
  onStartOver,
}: {
  batch: GenerationBatch
  busy: boolean
  workspaceSlug?: string
  onPreview: (id: string) => void
  onRetry: (id: string) => void
  onStartOver: () => void
}) {
  const ready = batch.results.filter((result) => result.status === "completed" && result.draft && !isExampleDraft(result.draft)).length
  const active = batch.results.find((result) => result.status === "running")
  return (
    <section aria-label="Generation results" className="grid min-w-0 gap-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Your drafts</h2>
          <p role="status" aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {active ? `Generating ${visualizationKindLabel(active.kind)}…` : `${ready} of ${batch.results.length} AI drafts ready.`}
          </p>
        </div>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onStartOver}>Start over</Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        These results use the source and style captured when this batch started. Retrying a failed format keeps the other drafts.
        {workspaceSlug ? " Slides save to this workspace. Course and Report drafts remain in this tab until workspace saving is available." : " Drafts are kept in this browser for up to four hours when storage is available. Creating an account does not automatically save them to a workspace."}
      </p>
      <ol className="grid min-w-0 gap-3">
        {batch.results.map((result) => {
          const example = result.draft ? isExampleDraft(result.draft) : false
          const retryable = result.status === "failed" || result.status === "interrupted"
          return (
            <li key={result.id} className="min-w-0 space-y-3 rounded-lg border border-black/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{visualizationKindLabel(result.kind)}</h3>
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  {result.status === "running" || result.saveStatus === "saving" ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {example ? "Previous example · not AI generated" : result.status === "completed" ? "AI draft ready" : result.status === "queued" ? "Waiting" : result.status === "running" ? "Generating" : result.status === "interrupted" ? "Interrupted · retry when ready" : "Generation failed"}
                </span>
              </div>
              {result.draft ? (
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">{result.draft.document.title}</p>
                  <p className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">{result.draft.document.summary}</p>
                  <p className="break-words text-xs text-muted-foreground">{result.draft.provider} · {result.draft.modelName}</p>
                </div>
              ) : null}
              {result.error ? <p className="break-words text-sm text-destructive">{result.error}</p> : null}
              {result.saveStatus === "saving" ? <p className="text-xs text-muted-foreground">Saving to the workspace…</p> : null}
              {result.saveStatus === "saved" && result.savedDeckId ? <p className="text-xs text-muted-foreground">Saved to the workspace.</p> : null}
              {result.saveStatus === "uncertain" ? <p className="text-xs text-muted-foreground">Saving could not be confirmed. Check the workspace before creating another copy.</p> : null}
              {result.saveStatus === "failed" ? <p className="text-xs text-muted-foreground">The AI draft is still available here; workspace saving did not complete.</p> : null}
              <div className="flex flex-wrap gap-2">
                {result.draft ? <Button type="button" variant="outline" className="min-h-11" onClick={() => onPreview(result.id)} aria-label={`Preview ${visualizationKindLabel(result.kind)}`}>Preview</Button> : null}
                {retryable ? <Button type="button" className="min-h-11" disabled={busy} onClick={() => onRetry(result.id)}>Retry {visualizationKindLabel(result.kind)}</Button> : null}
                {workspaceSlug && result.savedDeckId ? (
                  <Button nativeButton={false} render={<Link href={`/app/workspaces/${workspaceSlug}/decks/${result.savedDeckId}`} />} variant="secondary" className="min-h-11">Open saved Slides</Button>
                ) : workspaceSlug && result.saveStatus === "uncertain" ? (
                  <Button nativeButton={false} render={<Link href={`/app/workspaces/${workspaceSlug}`} />} variant="outline" className="min-h-11">Check workspace</Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
