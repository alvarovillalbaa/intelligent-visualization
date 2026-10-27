import { REPORT_GRID_COLUMNS, REPORT_GRID_GAP, REPORT_GRID_ROW_HEIGHT, type ReportBreakpoint } from "@/lib/client/report-grid"
import type { ReportLayoutItem, ReportVisualizationDocument } from "@/packages/domain/entities"

type Placements = Record<ReportBreakpoint, Map<string, ReportLayoutItem>>
// CSS Grid permits UA clamping and recommends support for lines through 10000:
// https://www.w3.org/TR/css-grid-2/#limit-large-grids
export const REPORT_ARTIFACT_MAX_GRID_LINE = 10_000

export interface ReportArtifactLayout {
  placements: Placements | null
  warnings: Array<{ code: string; message: string; nodeId?: string }>
}

// Stored documents are broader than the editor's current size limits. Validate
// renderable geometry here without imposing the editor's row or block caps.
export function reportArtifactLayout(report: ReportVisualizationDocument["report"]): ReportArtifactLayout {
  const fallback = (reason: string, nodeId?: string): ReportArtifactLayout => ({
    placements: null,
    warnings: [{ code: "REPORT_LAYOUT_FALLBACK", message: `${reason} The report is rendered in source order.`, ...(nodeId ? { nodeId } : {}) }],
  })
  const ids = new Set(report.blocks.map((block) => block.id))
  if (ids.size !== report.blocks.length || [...ids].some((id) => !id.trim())) return fallback("Report block IDs are missing or duplicated.")
  const placements: Placements = { lg: new Map(), md: new Map(), sm: new Map() }
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
    const items = report.layouts[breakpoint], columns = REPORT_GRID_COLUMNS[breakpoint]
    if (items.length !== ids.size) return fallback(`The ${breakpoint} layout does not position every report block exactly once.`)
    const positions = placements[breakpoint]
    for (const item of items) {
      if (!ids.has(item.blockId) || positions.has(item.blockId)) return fallback(`The ${breakpoint} layout contains an unknown or repeated block.`, item.blockId)
      const { x, y, w, h } = item
      if (![x, y, w, h, x + w, y + h].every(Number.isSafeInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > columns) {
        return fallback(`The ${breakpoint} layout contains an invalid position or size.`, item.blockId)
      }
      if (y + h + 1 > REPORT_ARTIFACT_MAX_GRID_LINE) return fallback(`The ${breakpoint} layout exceeds the artifact renderer's supported grid-line range.`, item.blockId)
      for (const key of ["minW", "minH", "maxW", "maxH"] as const) {
        const limit = item[key]
        if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) return fallback(`The ${breakpoint} layout contains an invalid size constraint.`, item.blockId)
      }
      if ((item.minW !== undefined && w < item.minW) || (item.maxW !== undefined && w > item.maxW)
        || (item.minH !== undefined && h < item.minH) || (item.maxH !== undefined && h > item.maxH)) {
        return fallback(`The ${breakpoint} layout does not respect a block's size constraints.`, item.blockId)
      }
      positions.set(item.blockId, item)
    }
    // At any valid row, positive integer widths bound active boxes by the
    // column count. Sorting a copy avoids quadratic scans of long flow layouts.
    let active: ReportLayoutItem[] = []
    for (const item of [...items].sort((a, b) => a.y - b.y)) {
      active = active.filter((other) => other.y + other.h > item.y)
      if (active.some((other) => item.x < other.x + other.w && other.x < item.x + item.w)) {
        return fallback(`The ${breakpoint} layout contains overlapping blocks.`, item.blockId)
      }
      active.push(item)
    }
  }
  return { placements, warnings: [] }
}

export function reportArtifactPlacement(placements: Placements, blockId: string): string {
  return (["sm", "md", "lg"] as const).map((breakpoint) => {
    const item = placements[breakpoint].get(blockId)!
    return `--iv-${breakpoint}-x:${item.x + 1};--iv-${breakpoint}-y:${item.y + 1};--iv-${breakpoint}-w:${item.w};--iv-${breakpoint}-h:${item.h}`
  }).join(";")
}

export const REPORT_ARTIFACT_CSS = `.report-artifact{container-type:inline-size;container-name:iv-report-artifact}.report>.report-grid,.report>.report-flow{padding:0;border:0}.report-context{max-width:760px}.report-sources{overflow-wrap:anywhere;min-width:0}.report-sources dd{margin-inline-start:0}.artifact-header{overflow-wrap:anywhere}.report p,.report blockquote{white-space:pre-wrap;overflow-wrap:anywhere}.report-cell{min-width:0;overflow-wrap:anywhere}.report-flow>.report-cell{padding:1.5rem 0;border-bottom:1px solid var(--border)}.report-grid{display:grid;grid-template-columns:repeat(${REPORT_GRID_COLUMNS.sm},minmax(0,1fr));grid-auto-rows:${REPORT_GRID_ROW_HEIGHT}px;gap:${REPORT_GRID_GAP}px}.report-grid>.report-cell{grid-column:var(--iv-sm-x)/span var(--iv-sm-w);grid-row:var(--iv-sm-y)/span var(--iv-sm-h);min-height:0;overflow:auto;padding:.75rem;border:1px solid var(--border);border-radius:8px}.report-grid>.report-cell:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.report-cell>:first-child{margin-top:0}.report-cell svg{max-width:100%;height:auto}.report-cell .chart figcaption{display:grid;gap:.5rem}.report-cell .kpi{display:grid;gap:.5rem}.report-cell .comparison{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}.report-link{display:grid;justify-items:start;gap:.5rem}.report .asset-placeholder{padding:1rem;border:1px dashed var(--border)}@container iv-report-artifact (min-width:768px){.report-grid{grid-template-columns:repeat(${REPORT_GRID_COLUMNS.md},minmax(0,1fr))}.report-grid>.report-cell{grid-column:var(--iv-md-x)/span var(--iv-md-w);grid-row:var(--iv-md-y)/span var(--iv-md-h)}}@container iv-report-artifact (min-width:1024px){.report-grid{grid-template-columns:repeat(${REPORT_GRID_COLUMNS.lg},minmax(0,1fr))}.report-grid>.report-cell{grid-column:var(--iv-lg-x)/span var(--iv-lg-w);grid-row:var(--iv-lg-y)/span var(--iv-lg-h)}}@media print{.report-artifact{container-type:normal}.report{max-width:none;padding:0}.report>.report-grid{display:block}.report-grid>.report-cell,.report-flow>.report-cell{height:auto;min-height:0;max-height:none;overflow:visible;padding:1rem 0;border:0;border-bottom:1px solid var(--border);break-inside:auto}.report-cell *{max-height:none;overflow:visible}.floating-cta{position:static;display:block;margin:1rem 0}}`
