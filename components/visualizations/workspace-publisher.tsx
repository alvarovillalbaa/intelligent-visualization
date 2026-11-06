"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { getWorkspacePublicationState, publishWorkspaceDraft, unpublishWorkspaceDraft, WorkspacePublicationRequestError } from "@/lib/client/workspace-publications"
import type { WorkspaceDraft } from "@/packages/backend-contracts/workspace-drafts"
import type { PublishWorkspaceDraftInput, UnpublishWorkspaceDraftInput, WorkspacePublicationState, WorkspacePublishedVersion, WorkspaceUnpublicationResult } from "@/packages/backend-contracts/workspace-publications"

export function WorkspacePublisher({ draft, canEdit, blocked, mutationBlocked, onRecoveryChange }: {
  draft: WorkspaceDraft
  canEdit: boolean
  blocked: boolean
  mutationBlocked: boolean
  onRecoveryChange?: (recovering: boolean) => void
}) {
  const [state, setState] = useState<WorkspacePublicationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [pending, setPending] = useState(false)
  const [pendingAction, setPendingAction] = useState<"publish" | "unpublish" | null>(null)
  const [unresolved, setUnresolved] = useState(false)
  const [unpublishUnresolved, setUnpublishUnresolved] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState<WorkspacePublishedVersion | null>(null)
  const [confirmation, setConfirmation] = useState<{ revision: number; hash: string; title: string } | null>(null)
  const [unpublishConfirmation, setUnpublishConfirmation] = useState<WorkspacePublishedVersion | null>(null)
  const [unpublishAcknowledgement, setUnpublishAcknowledgement] = useState<WorkspaceUnpublicationResult["receipt"] | null>(null)
  const attempt = useRef<PublishWorkspaceDraftInput | null>(null)
  const unpublishAttempt = useRef<UnpublishWorkspaceDraftInput | null>(null)
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
  const statusVerified = available && !pending && !unresolved && !unpublishUnresolved && !conflict
  const matchesBaseline = state?.draftRevision === draft.draftRevision && state.draftHash === draft.draftHash
  const showOriginal = acknowledged && (!state?.current || state.current.versionId !== acknowledged.versionId
    || state.draftRevision !== acknowledged.sourceRevision || state.draftHash !== acknowledged.documentHash)

  async function publish() {
    if (!canEdit || publishing.current || conflict || unpublishAttempt.current) return
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
    setPendingAction("publish")
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
      if (mounted.current) { setPending(false); setPendingAction(null) }
    }
  }

  async function unpublish() {
    if (!canEdit || publishing.current || conflict || attempt.current) return
    const recovering = unpublishAttempt.current !== null
    if (!recovering && (mutationBlocked || !available || !state?.current || !unpublishConfirmation
      || state.current.versionId !== unpublishConfirmation.versionId)) {
      setUnpublishConfirmation(null)
      setError("The public version changed or another save is unresolved. Refresh publication status and review Unpublish again.")
      return
    }
    let input: UnpublishWorkspaceDraftInput
    try {
      input = unpublishAttempt.current ?? { id: draft.id, requestId: crypto.randomUUID(),
        expectedCurrentVersionId: unpublishConfirmation!.versionId }
    } catch {
      setError("This browser could not prepare the unpublish request. No unpublish was sent.")
      return
    }
    unpublishAttempt.current = input
    const controller = new AbortController()
    publishing.current = controller
    reading.current?.abort()
    readGeneration.current++
    setLoading(false)
    setPending(true)
    setPendingAction("unpublish")
    setError(null)
    setConfirmation(null)
    setUnpublishConfirmation(null)
    recovery(true)
    try {
      const result = await unpublishWorkspaceDraft(draft.workspaceSlug, input, draft.kind, controller.signal)
      if (!mounted.current) return
      setState(result.state)
      setLoadError(null)
      setUnpublishAcknowledgement(result.receipt)
      if (result.status === "conflict") {
        setConflict(true)
        setUnpublishUnresolved(true)
        setError("The current publication changed. The original unpublish receipt and your local edits remain here. Use Reload saved draft to reconcile; this request will not unpublish a newer version.")
        return
      }
      unpublishAttempt.current = null
      setUnpublishUnresolved(false)
      recovery(false)
    } catch (cause) {
      if (!mounted.current) return
      const uncertain = recovering || !(cause instanceof WorkspacePublicationRequestError) || cause.uncertain
      setUnpublishUnresolved(uncertain)
      if (!uncertain) unpublishAttempt.current = null
      recovery(uncertain)
      const refusal = cause instanceof WorkspacePublicationRequestError && !cause.uncertain ? `${cause.message} ` : ""
      setError(uncertain ? `${refusal}Unpublish could not be confirmed. Keep this tab open and retry the same unpublish. Current public availability is unverified.`
        : cause instanceof WorkspacePublicationRequestError ? cause.message : "Unpublish was refused.")
    } finally {
      if (publishing.current === controller) publishing.current = null
      if (mounted.current) { setPending(false); setPendingAction(null) }
    }
  }

  return <section aria-label="Workspace publication" aria-busy={loading || pending} className="grid min-w-0 gap-3 rounded-xl border border-border bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Publication</h2>
    <p className="text-sm text-muted-foreground">Publish a saved revision explicitly. Later edits and saves do not change the published snapshot.</p>
    {loading ? <p role="status" className="text-sm">Checking publication status…</p> : null}
    {loadError ? <p ref={errorRef} tabIndex={-1} role="alert" className="break-words text-sm text-destructive outline-none">{loadError} Publication availability is unverified; a version may already be public.</p> : null}
    {statusVerified && state && !state.current ? <p role="status" className="text-sm">This saved draft has no current public version.</p> : null}
    {state?.current ? <div className="grid min-w-0 gap-2">
      <p role="status" className="break-words text-sm">{statusVerified ? "Current public" : "Last verified public"} revision {state.current.sourceRevision}: {state.current.title}</p>
      <div className="flex flex-wrap gap-3">
        <a href={state.current.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline">{statusVerified ? "Open current public version" : "Open last verified public version"}</a>
        <a href={state.current.versionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline">{statusVerified ? "Open immutable published version" : "Open last verified version URL"}</a>
      </div>
    </div> : null}
    {showOriginal && acknowledged ? <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
      <p>The original acknowledgement concerns revision {acknowledged.sourceRevision}. This historical URL may be revoked or unavailable; it does not assert current public access.</p>
      <a href={acknowledged.versionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center font-medium underline">Open historical acknowledged URL</a>
    </div> : null}
    {unpublishAcknowledgement?.status === "unpublished" ? <p role="status" className="text-sm">Unpublish was acknowledged at {unpublishAcknowledgement.revokedAt}. Later publications are separate; this receipt does not claim the current live state.</p> : null}
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="break-words text-sm text-destructive outline-none">{error}</p> : null}
    {available && !matchesBaseline ? <p className="text-sm text-muted-foreground">A different draft revision is saved. Reload the saved draft before publishing.</p> : null}
    {canEdit && blocked && !unresolved ? <p className="text-sm text-muted-foreground">Apply and save local changes, then close the editor before publishing the saved revision.</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={loading || pending || unresolved || unpublishUnresolved || conflict} onClick={() => {
        setLoading(true); setError(null); setConfirmation(null); setUnpublishConfirmation(null); setRefresh((value) => value + 1)
      }}>{loadError ? "Retry publication status" : "Refresh publication status"}</Button>
      {canEdit && !unresolved && !unpublishUnresolved && !conflict ? <Button type="button" className="min-h-11" disabled={pending || blocked || !available || !matchesBaseline}
        onClick={() => { setError(null); setUnpublishConfirmation(null); setConfirmation({ revision: draft.draftRevision, hash: draft.draftHash, title: draft.title }) }}>Publish saved revision</Button> : null}
      {canEdit && unresolved && !conflict ? <Button type="button" className="min-h-11" disabled={pending} onClick={() => { void publish() }}>{pending ? "Publishing…" : "Retry same publication"}</Button> : null}
      {canEdit && state?.current && !unresolved && !unpublishUnresolved && !conflict ? <Button type="button" variant="outline" className="min-h-11" disabled={pending || mutationBlocked || !available}
        onClick={() => { if (state?.current) { setError(null); setConfirmation(null); setUnpublishConfirmation(structuredClone(state.current)) } }}>Unpublish</Button> : null}
      {canEdit && unpublishUnresolved && !conflict ? <Button type="button" className="min-h-11" disabled={pending} onClick={() => { void unpublish() }}>{pending ? "Unpublishing…" : "Retry same unpublish"}</Button> : null}
    </div>
    {pending ? <p role="status" className="text-sm">{pendingAction === "unpublish" ? "Unpublishing the requested public version…" : "Publishing the requested saved revision…"}</p> : null}
    {canEdit && confirmation ? <div role="group" aria-label="Confirm public publication" className="grid min-w-0 gap-3 rounded-lg border border-border p-4">
      <p className="font-medium">Anyone with the public link can read this saved revision.</p>
      <p className="break-words text-sm">Revision {confirmation.revision}: {confirmation.title}. Unapplied or unsaved edits are not included.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={pending || blocked || !available || !matchesBaseline} onClick={() => { void publish() }}>Confirm publish</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmation(null)}>Cancel publication</Button>
      </div>
    </div> : null}
    {canEdit && unpublishConfirmation ? <div role="group" aria-label="Confirm unpublish" className="grid min-w-0 gap-3 rounded-lg border border-border p-4">
      <p className="font-medium">Unpublish stops new requests to the live link and every existing version URL.</p>
      <p className="text-sm">Already-open pages, requests admitted before revocation, and copied or downloaded content cannot be recalled.</p>
      <p className="text-sm">Your saved draft, local edits and published content are kept. A later publish creates a new version; old version URLs stay revoked.</p>
      <p className="break-words text-sm">Current public revision {unpublishConfirmation.sourceRevision}: {unpublishConfirmation.title}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" className="min-h-11" disabled={pending || mutationBlocked || !available} onClick={() => { void unpublish() }}>Confirm unpublish</Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setUnpublishConfirmation(null)}>Cancel unpublish</Button>
      </div>
    </div> : null}
  </section>
}
