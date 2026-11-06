"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { getWorkspacePublicationState, publishWorkspaceDraft, WorkspacePublicationRequestError } from "@/lib/client/workspace-publications"
import type { WorkspaceDraft } from "@/packages/backend-contracts/workspace-drafts"
import type { PublishWorkspaceDraftInput, WorkspacePublicationState, WorkspacePublishedVersion } from "@/packages/backend-contracts/workspace-publications"

export function WorkspacePublisher({ draft, canEdit, blocked, onRecoveryChange }: {
  draft: WorkspaceDraft
  canEdit: boolean
  blocked: boolean
  onRecoveryChange?: (recovering: boolean) => void
}) {
  const [state, setState] = useState<WorkspacePublicationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [pending, setPending] = useState(false)
  const [unresolved, setUnresolved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState<WorkspacePublishedVersion | null>(null)
  const [confirmation, setConfirmation] = useState<{ revision: number; hash: string; title: string } | null>(null)
  const attempt = useRef<PublishWorkspaceDraftInput | null>(null)
  const publishing = useRef<AbortController | null>(null), reading = useRef<AbortController | null>(null)
  const mounted = useRef(true), readGeneration = useRef(0), latest = useRef(draft)
  const recoveryCallback = useRef(onRecoveryChange)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => { latest.current = draft; recoveryCallback.current = onRecoveryChange }, [draft, onRecoveryChange])

  function recovery(value: boolean) { recoveryCallback.current?.(value) }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      publishing.current?.abort()
      reading.current?.abort()
      recoveryCallback.current?.(false)
    }
  }, [])
  useEffect(() => { if (error || loadError) errorRef.current?.focus() }, [error, loadError])
  useEffect(() => {
    const generation = ++readGeneration.current, controller = new AbortController()
    let settled = false
    reading.current = controller
    const release = () => {
      settled = true
      if (reading.current === controller) reading.current = null
    }
    queueMicrotask(() => {
      if (!mounted.current || generation !== readGeneration.current || controller.signal.aborted) { release(); return }
      setLoading(true)
      setLoadError(null)
      void getWorkspacePublicationState(draft.workspaceSlug, draft.id, draft.kind, controller.signal).then((value) => {
        release()
        if (!mounted.current || generation !== readGeneration.current || controller.signal.aborted) return
        setState(value)
        setLoading(false)
      }, (cause) => {
        release()
        if (!mounted.current || controller.signal.aborted || generation !== readGeneration.current) return
        setLoadError(cause instanceof WorkspacePublicationRequestError ? cause.message : "Publication status could not be loaded. A version may already be public.")
        setLoading(false)
      })
    })
    return () => {
      if (!settled) controller.abort()
      if (reading.current === controller) reading.current = null
    }
  }, [draft.id, draft.workspaceSlug, draft.kind, draft.draftRevision, draft.draftHash, refresh])

  const available = !loading && !loadError && state !== null
  const matchesBaseline = state?.draftRevision === draft.draftRevision && state.draftHash === draft.draftHash
  const showOriginal = acknowledged && (!state?.current || state.current.versionId !== acknowledged.versionId
    || state.draftRevision !== acknowledged.sourceRevision || state.draftHash !== acknowledged.documentHash)

  async function publish() {
    if (!canEdit || publishing.current || conflict) return
    const recovering = attempt.current !== null
    if (!recovering && (blocked || !available || !matchesBaseline || !confirmation
      || confirmation.revision !== latest.current.draftRevision || confirmation.hash !== latest.current.draftHash)) {
      setConfirmation(null)
      setError("The saved revision changed or has local changes. Review and save it before choosing Publish again.")
      return
    }
    let input: PublishWorkspaceDraftInput
    try {
      input = attempt.current ?? { id: draft.id, requestId: crypto.randomUUID(), versionId: crypto.randomUUID(),
        expectedRevision: confirmation!.revision, expectedDraftHash: confirmation!.hash }
    } catch {
      setError("This browser could not prepare the publication request. No publication was sent.")
      return
    }
    attempt.current = input
    const controller = new AbortController()
    publishing.current = controller
    reading.current?.abort()
    readGeneration.current++
    setLoading(false)
    setPending(true)
    setError(null)
    setConfirmation(null)
    recovery(true)
    try {
      const result = await publishWorkspaceDraft(draft.workspaceSlug, input, draft.kind, controller.signal)
      if (!mounted.current) return
      setState(result.state)
      setLoadError(null)
      setAcknowledged(result.receipt.publication)
      if (result.status === "conflict") {
        setConflict(true)
        setUnresolved(true)
        setError("The saved draft or live publication changed. Your local edits and original publication receipt remain here. Use Reload saved draft to reconcile before another publication.")
        return
      }
      attempt.current = null
      setUnresolved(false)
      recovery(false)
      if (latest.current.draftRevision !== input.expectedRevision || latest.current.draftHash !== input.expectedDraftHash) {
        setState(null)
        setRefresh((value) => value + 1)
      }
    } catch (cause) {
      if (!mounted.current) return
      const uncertain = recovering || !(cause instanceof WorkspacePublicationRequestError) || cause.uncertain
      setUnresolved(uncertain)
      if (!uncertain) attempt.current = null
      recovery(uncertain)
      setError(uncertain ? "Publication could not be confirmed. Keep this tab open and retry the same publication; its original saved revision and IDs are retained."
        : cause instanceof WorkspacePublicationRequestError ? cause.message : "The publication was refused.")
    } finally {
      if (publishing.current === controller) publishing.current = null
      if (mounted.current) setPending(false)
    }
  }

  return <section aria-label="Workspace publication" aria-busy={loading || pending} className="grid min-w-0 gap-3 rounded-xl border border-border bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Publication</h2>
    <p className="text-sm text-muted-foreground">Publish a saved revision explicitly. Later edits and saves do not change the published snapshot.</p>
    {loading ? <p role="status" className="text-sm">Checking publication status…</p> : null}
    {loadError ? <p ref={errorRef} tabIndex={-1} role="alert" className="break-words text-sm text-destructive outline-none">{loadError} Publication availability is unverified; a version may already be public.</p> : null}
    {available && state && !state.current ? <p role="status" className="text-sm">This saved draft has no current public version.</p> : null}
    {state?.current ? <div className="grid min-w-0 gap-2">
      <p role="status" className="break-words text-sm">{available ? "Current public" : "Last verified public"} revision {state.current.sourceRevision}: {state.current.title}</p>
      <div className="flex flex-wrap gap-3">
        <a href={state.current.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline">{available ? "Open current public version" : "Open last verified public version"}</a>
        <a href={state.current.versionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline">Open immutable published version</a>
      </div>
    </div> : null}
    {showOriginal && acknowledged ? <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
      <p>The original acknowledgement concerns revision {acknowledged.sourceRevision}; it does not assert which version is live now.</p>
      <a href={acknowledged.versionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center font-medium underline">Open acknowledged version</a>
    </div> : null}
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="break-words text-sm text-destructive outline-none">{error}</p> : null}
    {available && !matchesBaseline ? <p className="text-sm text-muted-foreground">A different draft revision is saved. Reload the saved draft before publishing.</p> : null}
    {canEdit && blocked && !unresolved ? <p className="text-sm text-muted-foreground">Apply and save local changes, then close the editor before publishing the saved revision.</p> : null}
    <div className="flex flex-wrap gap-2">
      {loadError ? <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setRefresh((value) => value + 1)}>Retry publication status</Button> : null}
      {canEdit && !unresolved && !conflict ? <Button type="button" className="min-h-11" disabled={pending || blocked || !available || !matchesBaseline}
        onClick={() => { setError(null); setConfirmation({ revision: draft.draftRevision, hash: draft.draftHash, title: draft.title }) }}>Publish saved revision</Button> : null}
      {canEdit && unresolved && !conflict ? <Button type="button" className="min-h-11" disabled={pending} onClick={() => { void publish() }}>{pending ? "Publishing…" : "Retry same publication"}</Button> : null}
    </div>
    {pending ? <p role="status" className="text-sm">Publishing the requested saved revision…</p> : null}
    {canEdit && confirmation ? <div role="group" aria-label="Confirm public publication" className="grid min-w-0 gap-3 rounded-lg border border-border p-4">
      <p className="font-medium">Anyone with the public link can read this saved revision.</p>
      <p className="break-words text-sm">Revision {confirmation.revision}: {confirmation.title}. Unapplied or unsaved edits are not included.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={pending || blocked || !available || !matchesBaseline} onClick={() => { void publish() }}>Confirm publish</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmation(null)}>Cancel publication</Button>
      </div>
    </div> : null}
  </section>
}
