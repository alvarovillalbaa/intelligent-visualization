"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { CourseEditor } from "@/components/visualizations/course-editor"
import { ReportEditor } from "@/components/visualizations/report-editor"
import { CourseDownload } from "@/components/visualizations/course-download"
import { ReportDownload } from "@/components/visualizations/report-download"
import { CoursePreview } from "@/components/visualizations/renderers/course-preview"
import { ReportPreview } from "@/components/visualizations/renderers/report-preview"
import { saveWorkspaceDraft, WorkspaceDraftRequestError } from "@/lib/client/workspace-drafts"
import { canonicalSerialize } from "@/packages/domain/canonical"
import type { SaveWorkspaceDraftInput, WorkspaceDraft, WorkspaceDraftDocument } from "@/packages/backend-contracts/workspace-drafts"

export function SavedDraftEditor({ initial, canEdit }: { initial: WorkspaceDraft; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial)
  const [document, setDocument] = useState(initial.document)
  const [editing, setEditing] = useState<{ key: number; document: WorkspaceDraftDocument } | null>(null)
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState(false)
  const [unresolved, setUnresolved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [reloadRequested, setReloadRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef(initial.document), baseline = useRef(initial)
  const attempt = useRef<SaveWorkspaceDraftInput | null>(null)
  const saving = useRef<AbortController | null>(null)
  const mounted = useRef(true), dirtyRef = useRef(false), leaveConfirmed = useRef(false), editGeneration = useRef(0)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const dirty = canonicalSerialize(document) !== canonicalSerialize(saved.document)
  const kindLabel = document.kind === "course" ? "Course" : "Report"

  useEffect(() => {
    mounted.current = true
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!leaveConfirmed.current && (dirtyRef.current || saving.current || attempt.current)) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => { mounted.current = false; saving.current?.abort(); window.removeEventListener("beforeunload", beforeUnload) }
  }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  function apply(value: WorkspaceDraftDocument) {
    if (!editing || value.kind !== initial.kind || canonicalSerialize(current.current) !== canonicalSerialize(editing.document)) {
      return "The draft changed while the editor was open. Keep these fields and reopen the current draft before applying."
    }
    const next = structuredClone(value)
    current.current = next
    dirtyRef.current = canonicalSerialize(next) !== canonicalSerialize(baseline.current.document)
    setDocument(next)
    setEditing(null)
    if (!attempt.current && !conflict) setError(null)
    return null
  }

  async function save() {
    if (!canEdit || saving.current || conflict) return
    const input = attempt.current ?? { id: initial.id, requestId: crypto.randomUUID(), expectedRevision: baseline.current.draftRevision,
      document: structuredClone(current.current) }
    attempt.current = input
    const controller = new AbortController()
    saving.current = controller
    setPending(true)
    setError(null)
    try {
      const result = await saveWorkspaceDraft(initial.workspaceSlug, input, controller.signal)
      if (!mounted.current) return
      if (result.status !== "saved" || result.receipt.status !== "saved" || result.receipt.acceptedRevision !== result.draft.draftRevision) {
        setConflict(true)
        setUnresolved(true)
        setError("A different revision is saved in the workspace. Your local edits are still here. Reload the saved draft before making another save.")
        return
      }
      attempt.current = null
      setUnresolved(false)
      baseline.current = result.draft
      setSaved(result.draft)
      if (canonicalSerialize(current.current) === canonicalSerialize(input.document)) {
        current.current = result.draft.document
        setDocument(result.draft.document)
      }
      dirtyRef.current = canonicalSerialize(current.current) !== canonicalSerialize(result.draft.document)
    } catch (cause) {
      if (!mounted.current) return
      const uncertain = !(cause instanceof WorkspaceDraftRequestError) || cause.uncertain || unresolved
      setUnresolved(uncertain)
      if (!uncertain) attempt.current = null
      setError(cause instanceof WorkspaceDraftRequestError ? cause.message : "The save could not be confirmed. Keep your edits and retry this same save.")
    } finally {
      if (saving.current === controller) saving.current = null
      if (mounted.current) setPending(false)
    }
  }

  function reload() {
    if (pending) return
    if (dirty || unresolved || conflict) setReloadRequested(true)
    else window.location.reload()
  }

  return <section className="mx-auto grid w-full min-w-0 max-w-5xl gap-6" aria-label={`Saved ${kindLabel}`}>
    <header className="grid min-w-0 gap-3">
      <a href={`/app/workspaces/${encodeURIComponent(initial.workspaceSlug)}`} className="w-fit text-sm font-medium text-primary underline">Back to workspace</a>
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Private {kindLabel} draft</p>
      <h1 className="break-words text-3xl font-semibold tracking-tight">{document.title}</h1>
      <p className="break-words text-muted-foreground">{document.summary}</p>
      <p role="status" aria-live="polite" className="text-sm">{pending ? "Saving revision…" : `Saved revision ${saved.draftRevision}.`}</p>
      {dirty ? <p className="text-sm text-muted-foreground">Changes in this tab have not been saved to the workspace.</p> : null}
      <p className="text-xs text-muted-foreground">This draft is private. Publishing is not available yet. HTML downloads include the edits shown in this tab.</p>
    </header>
    <div className="flex flex-wrap gap-2">
      {canEdit ? <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing({ key: ++editGeneration.current, document: structuredClone(current.current) })}>Edit {kindLabel}</Button> : null}
      {canEdit ? <Button type="button" className="min-h-11" disabled={pending || conflict || (!dirty && !unresolved)} onClick={() => { void save() }}>
        {pending ? "Saving revision…" : unresolved ? "Retry same save" : "Save revision"}
      </Button> : <p className="self-center text-sm text-muted-foreground">Your workspace role has read-only access.</p>}
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setPreview((value) => !value)}>{preview ? "Hide preview" : "Preview"}</Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={reload}>Reload saved draft</Button>
    </div>
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="break-words rounded-xl bg-destructive/10 p-4 text-sm text-destructive outline-none">{error}</p> : null}
    {reloadRequested ? <div className="grid gap-3 rounded-xl border border-border bg-white p-4" role="alert">
      <p>Reload the saved draft and discard the local edits and unresolved save shown in this tab?</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setReloadRequested(false)}>Keep editing</Button>
        <Button type="button" className="min-h-11" onClick={() => { leaveConfirmed.current = true; window.location.reload() }}>Discard and reload</Button>
      </div>
    </div> : null}
    {document.kind === "course" ? <CourseDownload document={document} /> : <ReportDownload document={document} />}
    {preview ? <div className="min-w-0 overflow-hidden rounded-xl bg-white p-3 sm:p-6">
      {document.kind === "course" ? <CoursePreview document={document} /> : <ReportPreview document={document} />}
    </div> : null}
    {editing?.document.kind === "course" ? <CourseEditor key={editing.key} document={editing.document} onApply={apply} onCancel={() => setEditing(null)}
      persistenceNote="Apply changes to this tab, then choose Save revision to save them to the workspace." /> : null}
    {editing?.document.kind === "report" ? <ReportEditor key={editing.key} document={editing.document} onApply={apply} onCancel={() => setEditing(null)}
      persistenceNote="Apply changes to this tab, then choose Save revision to save them to the workspace." /> : null}
  </section>
}
