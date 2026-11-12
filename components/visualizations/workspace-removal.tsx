"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { getWorkspaceRemovalReview, removeWorkspaceDraft, WorkspaceRemovalRequestError } from "@/lib/client/workspace-removals"
import type { RemoveWorkspaceDraftInput, WorkspaceRemovalReview } from "@/packages/backend-contracts/workspace-removals"

export function WorkspaceRemoval({ id, kind, workspaceSlug, canWrite }: { id: string; kind: "course" | "report"; workspaceSlug: string; canWrite: boolean }) {
  const router = useRouter(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [review, setReview] = useState<WorkspaceRemovalReview | null>(null), [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false), [terminal, setTerminal] = useState(false)
  const attempt = useRef<RemoveWorkspaceDraftInput | null>(null), pending = useRef(false)
  const label = kind === "course" ? "Course" : "Report"
  useEffect(() => {
    if (!uncertain && !busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [uncertain, busy])
  async function load() {
    if (pending.current || attempt.current) return
    pending.current = true; setBusy(true); setError(null); setReview(null); setOpen(true)
    try { setReview(await getWorkspaceRemovalReview(workspaceSlug, id, kind)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The saved item could not be reviewed.") }
    finally { pending.current = false; setBusy(false) }
  }
  async function remove() {
    if (pending.current || !review) return
    attempt.current ??= { id, requestId: crypto.randomUUID(), expected: { draftRevision: review.draftRevision,
      draftHash: review.draftHash, status: review.status, publishedVersionId: review.publishedVersionId } }
    pending.current = true; setBusy(true); setError(null)
    try {
      const result = await removeWorkspaceDraft(workspaceSlug, attempt.current)
      setUncertain(false); attempt.current = null
      if (result.status === "removed") { setTerminal(true); setOpen(false); router.refresh() }
      else {
        setReview(null)
        if (result.current.status === "removed") { setTerminal(true); setError("This item is already unavailable. This request did not confirm its removal.") }
        else setError("This item changed after you reviewed it. Load its latest saved state before confirming again.")
      }
    } catch (cause) {
      const unknown = !(cause instanceof WorkspaceRemovalRequestError) || cause.uncertain
      setUncertain(unknown)
      if (!unknown) { attempt.current = null; setReview(null) }
      setError(cause instanceof Error ? cause.message : "Removal could not be confirmed. Retry the same removal.")
    } finally { pending.current = false; setBusy(false) }
  }
  if (terminal && !open) return <span role="status" className="text-sm text-muted-foreground">Removed from workspace</span>
  return <div className="flex flex-wrap items-center gap-2">
    {open ? <span className="px-4 text-sm text-muted-foreground">{label} review open</span>
      : <Link href={`/app/workspaces/${encodeURIComponent(workspaceSlug)}/visualizations/${id}`} className="inline-flex min-h-11 items-center rounded-full bg-[#111513] px-4 text-sm font-medium text-white">Open saved {label}</Link>}
    {canWrite ? <Button variant="ghost" disabled={open} onClick={() => void load()}>Remove from workspace</Button> : null}
    <Dialog open={open} onOpenChange={(next) => { if (!busy && !uncertain) setOpen(next) }}>
      <DialogContent showCloseButton={!busy && !uncertain}>
        <DialogTitle>Remove this {label} from workspace?</DialogTitle>
        <DialogDescription>The saved item becomes unavailable and new public reads stop. Its history, source documents and stored files remain retained. This cannot be undone here. Unsaved changes in other tabs are not saved by this action.</DialogDescription>
        {review ? <p className="break-words font-medium">{review.title} · saved revision {review.draftRevision}</p> : null}
        {busy ? <p role="status">{attempt.current ? "Removing saved item…" : "Loading latest saved state…"}</p> : null}
        {error ? <p role="alert" className="break-words text-destructive">{error}</p> : null}
        <DialogFooter>
          {!uncertain ? <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); if (terminal) router.refresh() }}>Close</Button> : null}
          {terminal ? null : !review ? <Button disabled={busy} onClick={() => void load()}>Load latest saved state</Button>
            : <Button disabled={busy} variant="destructive" onClick={() => void remove()}>{uncertain ? "Retry same removal" : "Confirm removal"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
