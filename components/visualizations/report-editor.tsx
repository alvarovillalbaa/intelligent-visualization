"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  addReportBlock, changeReportLayout, duplicateReportBlock, prepareReportEdit, removeReportBlock, validateReportEdit,
  REPORT_GRID_COLUMNS, type ReportBreakpoint,
} from "@/lib/client/report-authoring"
import type { ReportLayoutItem, ReportVisualizationDocument } from "@/packages/domain/entities"
import { AddBlockControl, BlockFields, REPORT_BLOCK_OPTIONS } from "./report-editor/block-fields"
import { CheckField, EditorSection, NumericField, TextField } from "./report-editor/fields"
import { GridCanvas } from "./report-editor/grid-canvas"
import { commitReportHistory, createReportHistory, redoReportHistory, reportDraftsEqual, undoReportHistory, type ReportHistory } from "./report-editor/history"
import { ReportPreview } from "./renderers/report-preview"

export interface ReportEditorProps {
  document: ReportVisualizationDocument
  onApply: (value: ReportVisualizationDocument) => string | null
  onCancel: () => void
  persistenceNote?: string
}

type PositionFields = { blockId: string; breakpoint: ReportBreakpoint; values: Record<"x" | "y" | "w" | "h", string> }

export function ReportEditor({ document: initialDocument, onApply, onCancel, persistenceNote }: ReportEditorProps) {
  const [initial] = useState(() => {
    try { return { document: prepareReportEdit(initialDocument), error: null } }
    catch (cause) { return { document: structuredClone(initialDocument), error: cause instanceof Error ? cause.message : "The report layout could not be opened." } }
  })
  const [history, setHistory] = useState(() => createReportHistory(initial.document))
  const historyRef = useRef(history)
  const [positionFields, setPositionFields] = useState<PositionFields | null>(null)
  const positionRef = useRef<PositionFields | null>(null)
  const [baseline] = useState(() => structuredClone(initial.document))
  const [breakpoint, setBreakpoint] = useState<ReportBreakpoint>("lg")
  const [selectedId, setSelectedId] = useState<string | null>(initial.document.report.blocks[0]?.id ?? null)
  const [view, setView] = useState<"edit" | "preview">("edit")
  const [preview, setPreview] = useState<ReportVisualizationDocument | null>(null)
  const [closeRequested, setCloseRequested] = useState(false)
  const [error, setError] = useState<{ message: string } | null>(initial.error ? { message: initial.error } : null)
  const errorRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const applying = useRef(false)
  const draft = history.present
  const dirty = !reportDraftsEqual(draft, baseline) || positionFields !== null
  const selected = draft.report.blocks.find((block) => block.id === selectedId) ?? draft.report.blocks[0]
  const layout = draft.report.layouts[breakpoint].find((item) => item.blockId === selected?.id)
  const lockedAnywhere = selected ? Object.values(draft.report.layouts).some((items) => items.some((item) => item.blockId === selected.id && item.locked)) : false

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => { if (closeRequested) closeRef.current?.focus() }, [closeRequested])

  function showError(message: string) { setError({ message }); setView("edit") }

  function replace(next: ReportHistory) {
    historyRef.current = next
    setHistory(next)
    setError(null)
    setView("edit")
    setCloseRequested(false)
  }

  function perform(change: (document: ReportVisualizationDocument) => ReportVisualizationDocument) {
    try { replace(commitReportHistory(historyRef.current, change(historyRef.current.present))) }
    catch (cause) { showError(cause instanceof Error ? cause.message : "The change could not be made. Your draft is still here.") }
  }

  function update(change: (document: ReportVisualizationDocument) => void) {
    perform((current) => { const next = structuredClone(current); change(next); return next })
  }

  function updateLayout(patch: Partial<Pick<ReportLayoutItem, "x" | "y" | "w" | "h" | "locked">>) {
    if (positionRef.current) { showError("Apply or discard the position fields before changing the lock."); return }
    if (selected) perform((current) => changeReportLayout(current, breakpoint, selected.id, patch))
  }

  function discardPositionFields() { positionRef.current = null; setPositionFields(null) }

  function editPosition(key: "x" | "y" | "w" | "h", value: string) {
    if (!layout || !selected) return
    const current = positionRef.current ?? { blockId: selected.id, breakpoint, values: { x: String(layout.x), y: String(layout.y), w: String(layout.w), h: String(layout.h) } }
    const next = { ...current, values: { ...current.values, [key]: value } }
    positionRef.current = next
    setPositionFields(next)
    setError(null)
    setCloseRequested(false)
  }

  function applyPositionFields(): boolean {
    const pending = positionRef.current
    if (!pending) return true
    try {
      const numbers = Object.fromEntries(Object.entries(pending.values).map(([key, text]) => [key, text.trim() === "" ? Number.NaN : Number(text)])) as Record<"x" | "y" | "w" | "h", number>
      const next = changeReportLayout(historyRef.current.present, pending.breakpoint, pending.blockId, numbers)
      replace(commitReportHistory(historyRef.current, next))
      discardPositionFields()
      return true
    } catch (cause) { showError(cause instanceof Error ? cause.message : "Check the position and size fields."); return false }
  }

  function chooseBlock(id: string) {
    if (positionRef.current) { showError("Apply or discard the position fields before choosing another block."); return }
    setSelectedId(id)
  }

  function chooseBreakpoint(size: ReportBreakpoint) {
    if (positionRef.current) { showError("Apply or discard the position fields before choosing another size."); return }
    setBreakpoint(size)
  }

  function undo() {
    if (positionRef.current) { discardPositionFields(); setError(null); return }
    replace(undoReportHistory(historyRef.current))
  }

  function requestClose() {
    if (!dirty) { onCancel(); return }
    lastFocus.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null
    setCloseRequested(true)
  }

  function keepEditing() {
    setCloseRequested(false)
    requestAnimationFrame(() => { const target = lastFocus.current; if (target?.isConnected && formRef.current?.contains(target)) target.focus() })
  }

  function showPreview() {
    if (!applyPositionFields()) return
    try { setPreview(validateReportEdit(historyRef.current.present)); setView("preview"); setError(null); setCloseRequested(false) }
    catch (cause) { showError(cause instanceof Error ? cause.message : "Check the report fields before previewing.") }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applying.current) return
    if (!applyPositionFields()) return
    applying.current = true
    setCloseRequested(false)
    try {
      const message = onApply(validateReportEdit(historyRef.current.present))
      if (message !== null) showError(message)
    } catch (cause) { showError(cause instanceof Error ? cause.message : "The report could not be applied. Your draft is still here.") }
    finally { applying.current = false }
  }

  return <Dialog open onOpenChange={(open, details) => { if (!open) { if (dirty) details.cancel(); requestClose() } }}>
    <DialogContent showCloseButton={false} className="flex h-[92dvh] max-h-[960px] w-[96vw] max-w-7xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-7xl">
      <form ref={formRef} noValidate onSubmit={apply} className="flex min-h-0 flex-1 flex-col" onKeyDown={(event) => {
        const tag = (event.target as HTMLElement).tagName
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
          event.preventDefault(); if (event.shiftKey) { if (!positionRef.current) replace(redoReportHistory(historyRef.current)) } else undo()
        }
      }}>
        <DialogHeader className="shrink-0 gap-4 border-b border-border p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div className="grid gap-2">
            <DialogTitle>Edit report</DialogTitle><DialogDescription>Arrange responsive blocks, edit their content, then preview and apply your draft.</DialogDescription>
          </div><Button type="button" variant="ghost" className="min-h-11 shrink-0" onClick={requestClose}>Close</Button></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Report editor view">
            <Button type="button" variant={view === "edit" ? "secondary" : "outline"} className="min-h-11" aria-pressed={view === "edit"} onClick={() => setView("edit")}>Edit fields and layout</Button>
            <Button type="button" variant={view === "preview" ? "secondary" : "outline"} className="min-h-11" aria-pressed={view === "preview"} onClick={showPreview}>Preview draft</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={!history.past.length && !positionFields} onClick={undo}>Undo</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={!history.future.length || positionFields !== null} onClick={() => replace(redoReportHistory(historyRef.current))}>Redo</Button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Report responsive layout">
            {(["lg", "md", "sm"] as const).map((size) => <Button key={size} type="button" variant={breakpoint === size ? "secondary" : "outline"} className="min-h-11" aria-pressed={breakpoint === size} onClick={() => chooseBreakpoint(size)}>
              {size === "lg" ? "Large" : size === "md" ? "Medium" : "Small"} · {REPORT_GRID_COLUMNS[size]} columns
            </Button>)}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {closeRequested ? <div ref={closeRef} tabIndex={-1} role="group" aria-label="Discard unapplied report changes?" className="mb-5 grid gap-3 rounded-xl border border-border p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="text-sm">You have unapplied changes. Keep editing, or discard this draft&apos;s changes.</p><div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={keepEditing}>Keep editing</Button>
              <Button type="button" variant="destructive" className="min-h-11" onClick={onCancel}>Discard changes</Button>
            </div>
          </div> : null}
          {error ? <div ref={errorRef} role="alert" tabIndex={-1} className="mb-5 max-h-40 overflow-y-auto whitespace-pre-line rounded-xl border border-destructive/40 p-3 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">{error.message}</div> : null}
          {initial.error ? <p className="text-sm leading-6 text-muted-foreground">This draft could not be opened for editing. Close the editor to keep the existing draft. No changes have been made.</p> : view === "preview" && preview ? <section aria-label="Unapplied report preview" className="overflow-hidden rounded-xl border border-border">
            <p className="border-b border-border p-4 text-sm text-muted-foreground">Preview of your unapplied {breakpoint} layout. Return to Edit fields and layout to make changes.</p>
            <ReportPreview document={preview} breakpoint={breakpoint} />
          </section> : <div className="grid min-w-0 gap-6">
            <EditorSection title="Report details">
              <TextField label="Report title" value={draft.title} onChange={(value) => update((next) => { next.title = value })} />
              <TextField label="Report subtitle" value={draft.subtitle ?? ""} onChange={(value) => update((next) => { if (value) next.subtitle = value; else delete next.subtitle })} />
              <TextField label="Report summary" value={draft.summary} multiline onChange={(value) => update((next) => { next.summary = value })} />
              <TextField label="Report audience" value={draft.audience} onChange={(value) => update((next) => { next.audience = value })} />
              <TextField label="Report goal" value={draft.goal} multiline onChange={(value) => update((next) => { next.goal = value })} />
              <TextField label="Decision question" value={draft.report.decisionQuestion ?? ""} multiline onChange={(value) => update((next) => { if (value) next.report.decisionQuestion = value; else delete next.report.decisionQuestion })} />
              <TextField label="Executive summary" value={draft.report.executiveSummary ?? ""} multiline onChange={(value) => update((next) => { if (value) next.report.executiveSummary = value; else delete next.report.executiveSummary })} />
              <TextField label="SEO title" value={draft.seo.title} onChange={(value) => update((next) => { next.seo.title = value })} />
              <TextField label="SEO description" value={draft.seo.description} multiline onChange={(value) => update((next) => { next.seo.description = value })} />
            </EditorSection>
            <EditorSection title="Responsive layout" description="Each size has an independent arrangement. Locking protects a block’s position and size at that size; content can still be edited. Unlock it at every size before removing it.">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a report block">
                {draft.report.blocks.map((block, index) => <Button key={block.id} type="button" variant={selected?.id === block.id ? "secondary" : "outline"} className="min-h-11 max-w-full whitespace-normal break-words" aria-pressed={selected?.id === block.id} onClick={() => chooseBlock(block.id)}>
                  {index + 1}. {REPORT_BLOCK_OPTIONS.find((entry) => entry.value === block.kind)?.label ?? block.kind}
                </Button>)}
              </div>
              <GridCanvas document={draft} breakpoint={breakpoint} selectedId={selected?.id ?? null} disabled={positionFields !== null} onError={showError} onChange={(id, patch) => {
                if (positionRef.current) { showError("Apply or discard the position fields before dragging."); return }
                if (historyRef.current.present !== draft) { showError("The draft changed during the drag. Try again."); return }
                perform((current) => changeReportLayout(current, breakpoint, id, patch))
              }} />
              {selected && layout ? <div className="grid min-w-0 gap-4 rounded-xl border border-border p-4">
                <h4 className="font-semibold">Selected block: {REPORT_BLOCK_OPTIONS.find((entry) => entry.value === selected.kind)?.label}</h4>
                <CheckField label={`Lock block in ${breakpoint} layout`} checked={layout.locked ?? false} onChange={(locked) => updateLayout({ locked })} />
                <p className="text-xs leading-5 text-muted-foreground">Position fields are staged together. Choose Apply position and size to check them. Preview draft and Apply changes also check these fields. Discard position fields keeps the current arrangement.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumericField label="Column position" value={positionFields?.values.x ?? String(layout.x)} max={REPORT_GRID_COLUMNS[breakpoint] - layout.w} disabled={layout.locked} onChange={(value) => editPosition("x", value)} />
                  <NumericField label="Row position" value={positionFields?.values.y ?? String(layout.y)} max={256 - layout.h} disabled={layout.locked} onChange={(value) => editPosition("y", value)} />
                  <NumericField label="Width in columns" value={positionFields?.values.w ?? String(layout.w)} min={layout.minW ?? 1} max={Math.min(layout.maxW ?? REPORT_GRID_COLUMNS[breakpoint], REPORT_GRID_COLUMNS[breakpoint] - layout.x)} disabled={layout.locked} onChange={(value) => editPosition("w", value)} />
                  <NumericField label="Height in rows" value={positionFields?.values.h ?? String(layout.h)} min={layout.minH ?? 1} max={Math.min(layout.maxH ?? 256, 256 - layout.y)} disabled={layout.locked} onChange={(value) => editPosition("h", value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={!positionFields} onClick={applyPositionFields}>Apply position and size</Button>
                  <Button type="button" variant="outline" className="min-h-11" disabled={!positionFields} onClick={() => { discardPositionFields(); setError(null) }}>Discard position fields</Button>
                  <Button type="button" variant="outline" className="min-h-11" disabled={positionFields !== null} onClick={() => perform((current) => duplicateReportBlock(current, selected.id))}>Duplicate block</Button>
                  <Button type="button" variant="destructive" className="min-h-11" disabled={draft.report.blocks.length <= 1 || lockedAnywhere || positionFields !== null} onClick={() => perform((current) => removeReportBlock(current, selected.id))}>Remove block</Button>
                </div>
              </div> : null}
              <AddBlockControl assetIds={draft.assetIds} onAdd={(kind) => { if (positionRef.current) { showError("Apply or discard the position fields before adding a block."); return }; perform((current) => addReportBlock(current, kind)) }} />
            </EditorSection>
            {selected ? <EditorSection title={`Block content · ${REPORT_BLOCK_OPTIONS.find((entry) => entry.value === selected.kind)?.label ?? selected.kind}`}>
              <BlockFields key={selected.id} block={selected} assetIds={draft.assetIds} onChange={(value) => update((next) => { next.report.blocks = next.report.blocks.map((block) => block.id === selected.id ? value : block) })} />
            </EditorSection> : null}
            <EditorSection title="Source snapshots" description="These supplied records remain unchanged when applying edits. Data import and new immutable snapshots are separate features.">
              {draft.report.dataSources.length ? draft.report.dataSources.map((source) => <dl key={source.id} className="grid min-w-0 gap-1 rounded-xl border border-border p-3 text-xs">
                <dt className="font-semibold">{source.label}</dt><dd className="break-all">Hash: {source.contentHash}</dd>
                {source.rowCount !== undefined ? <dd>Rows: {source.rowCount}</dd> : null}<dd className="break-words leading-5">{source.provenance}</dd>
              </dl>) : <p className="text-sm text-muted-foreground">No data source snapshots are attached to this draft.</p>}
            </EditorSection>
          </div>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-6">
          <p className="min-w-0 flex-1 basis-60 text-xs leading-5 text-muted-foreground">{persistenceNote ?? "Apply updates this draft. Saving and publishing are separate actions."}</p>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={requestClose}>Cancel</Button><Button type="submit" className="min-h-11" disabled={Boolean(initial.error)}>Apply changes</Button></div>
        </footer>
      </form>
    </DialogContent>
  </Dialog>
}
