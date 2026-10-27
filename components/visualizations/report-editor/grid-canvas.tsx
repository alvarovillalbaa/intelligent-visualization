"use client"

import { useEffect, useRef, useState, type PointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { REPORT_GRID_COLUMNS, REPORT_GRID_GAP, REPORT_GRID_ROW_HEIGHT, type ReportBreakpoint } from "@/lib/client/report-authoring"
import type { ReportLayoutItem, ReportVisualizationDocument } from "@/packages/domain/entities"
import { ReportBlockView } from "../renderers/report-preview"

type LayoutPatch = Pick<ReportLayoutItem, "x" | "y" | "w" | "h">
interface Gesture {
  pointerId: number; blockId: string; breakpoint: ReportBreakpoint; mode: "move" | "resize";
  startX: number; startY: number; width: number; columnStep: number; original: ReportLayoutItem;
  document: ReportVisualizationDocument; node: HTMLButtonElement
}

export function GridCanvas({ document, breakpoint, selectedId, onChange, onError, disabled = false }: {
  document: ReportVisualizationDocument; breakpoint: ReportBreakpoint; selectedId: string | null;
  onChange: (blockId: string, patch: LayoutPatch) => void; onError: (message: string) => void; disabled?: boolean
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef({ document, breakpoint, selectedId, disabled })
  latest.current = { document, breakpoint, selectedId, disabled }
  const [ghost, setGhost] = useState<{ id: string; item: ReportLayoutItem } | null>(null)
  const columns = REPORT_GRID_COLUMNS[breakpoint]
  const layout = document.report.layouts[breakpoint]
  const selected = layout.find((item) => item.blockId === selectedId)
  const rows = Math.max(8, ...layout.map((item) => Number.isSafeInteger(item.y + item.h) ? item.y + item.h : 0), ghost ? ghost.item.y + ghost.item.h : 0) + 4

  function cancelGesture() {
    const active = gesture.current
    gesture.current = null
    setGhost(null)
    if (active?.node.hasPointerCapture?.(active.pointerId)) active.node.releasePointerCapture(active.pointerId)
  }

  useEffect(() => { cancelGesture() }, [document, breakpoint, selectedId, disabled])
  useEffect(() => {
    const cancel = () => cancelGesture()
    window.addEventListener("blur", cancel)
    return () => {
      window.removeEventListener("blur", cancel)
      const active = gesture.current
      gesture.current = null
      if (active?.node.hasPointerCapture?.(active.pointerId)) active.node.releasePointerCapture(active.pointerId)
    }
  }, [])

  function start(event: PointerEvent<HTMLButtonElement>, mode: Gesture["mode"]) {
    if (disabled || event.button !== 0 || !event.isPrimary || !selected || selected.locked || gesture.current) return
    const width = canvasRef.current?.getBoundingClientRect().width ?? 0
    if (width <= REPORT_GRID_GAP * (columns - 1)) return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { onError("The drag could not start. Use the position and size fields instead."); return }
    gesture.current = {
      pointerId: event.pointerId, blockId: selected.blockId, breakpoint, mode, startX: event.clientX, startY: event.clientY,
      width, columnStep: (width + REPORT_GRID_GAP) / columns, original: { ...selected }, document, node: event.currentTarget,
    }
    setGhost({ id: selected.blockId, item: { ...selected } })
  }

  function candidate(event: PointerEvent<HTMLButtonElement>, active: Gesture): ReportLayoutItem {
    const dx = Math.round((event.clientX - active.startX) / active.columnStep)
    const dy = Math.round((event.clientY - active.startY) / (REPORT_GRID_ROW_HEIGHT + REPORT_GRID_GAP))
    const original = active.original
    if (active.mode === "move") return { ...original, x: Math.max(0, Math.min(columns - original.w, original.x + dx)), y: Math.max(0, Math.min(256 - original.h, original.y + dy)) }
    return { ...original,
      w: Math.max(original.minW ?? 1, Math.min(original.maxW ?? columns, columns - original.x, original.w + dx)),
      h: Math.max(original.minH ?? 1, Math.min(original.maxH ?? 256, 256 - original.y, original.h + dy)),
    }
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current
    if (!active || event.pointerId !== active.pointerId) return
    setGhost({ id: active.blockId, item: candidate(event, active) })
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current
    if (!active || event.pointerId !== active.pointerId) return
    const width = canvasRef.current?.getBoundingClientRect().width
    const owned = !latest.current.disabled && latest.current.document === active.document && latest.current.breakpoint === active.breakpoint && latest.current.selectedId === active.blockId && width === active.width
    const item = candidate(event, active)
    cancelGesture()
    if (!owned) { onError("The layout changed during the drag. Try again or use the position fields."); return }
    onChange(active.blockId, { x: item.x, y: item.y, w: item.w, h: item.h })
  }

  const pointerHandlers = {
    onPointerMove: move, onPointerUp: finish,
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => { if (gesture.current?.pointerId === event.pointerId) cancelGesture() },
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => { if (gesture.current?.pointerId === event.pointerId) cancelGesture() },
  }

  return <section aria-label="Report layout canvas" className="grid min-w-0 gap-3">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11 touch-none select-none" style={{ touchAction: "none" }} disabled={disabled || !selected || selected.locked}
        aria-label="Drag selected block" onPointerDown={(event) => start(event, "move")} {...pointerHandlers}>Drag selected block</Button>
      <Button type="button" variant="outline" className="min-h-11 touch-none select-none" style={{ touchAction: "none" }} disabled={disabled || !selected || selected.locked}
        aria-label="Resize selected block" onPointerDown={(event) => start(event, "resize")} {...pointerHandlers}>Resize selected block</Button>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">Choose a block, then drag either handle above. Release to apply a snapped position or size; overlapping blocks are rejected. Use the position fields for keyboard control. Card previews are cropped; Preview draft shows scrollable content.</p>
    <div className="max-h-[560px] min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-border bg-muted/30 p-2">
      <div ref={canvasRef} aria-label={`${breakpoint} layout, ${columns} columns`} className="relative grid min-w-0"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: `${REPORT_GRID_ROW_HEIGHT}px`, gap: `${REPORT_GRID_GAP}px`, minHeight: `${rows * (REPORT_GRID_ROW_HEIGHT + REPORT_GRID_GAP) - REPORT_GRID_GAP}px` }}>
        {document.report.blocks.map((block) => {
          const item = ghost?.id === block.id ? ghost.item : layout.find((entry) => entry.blockId === block.id)
          if (!item || ![item.x, item.y, item.w, item.h].every(Number.isSafeInteger) || item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1 || item.x + item.w > columns || item.y + item.h > 256) return null
          return <div key={block.id} data-report-block={block.id} className={`relative min-h-0 min-w-0 overflow-hidden rounded-lg border p-3 ${selectedId === block.id ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
            style={{ gridColumn: `${item.x + 1} / span ${item.w}`, gridRow: `${item.y + 1} / span ${item.h}`, background: document.theme.background, color: document.theme.foreground,
              fontFamily: document.theme.bodyFont, "--iv-accent": document.theme.accent, "--iv-muted": document.theme.muted, "--iv-border": document.theme.border, "--iv-background": document.theme.background, "--iv-display-font": document.theme.displayFont } as React.CSSProperties}>
            <div inert aria-hidden="true" className="pointer-events-none min-w-0 break-words"><ReportBlockView block={block} /></div>
            <span className="absolute bottom-0 right-0 max-w-full truncate bg-background/90 px-1 text-[10px] text-foreground" aria-hidden="true">{item.locked ? "Locked · " : ""}{item.x},{item.y} · {item.w}×{item.h}</span>
          </div>
        })}
      </div>
    </div>
    {ghost ? <p role="status" aria-live="polite" className="text-xs">Proposed position {ghost.item.x}, {ghost.item.y}; size {ghost.item.w} by {ghost.item.h}. Release to check and apply.</p> : null}
  </section>
}
