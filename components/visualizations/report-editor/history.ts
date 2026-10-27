import type { ReportVisualizationDocument } from "@/packages/domain/entities"

export interface ReportHistory {
  past: ReportVisualizationDocument[]
  present: ReportVisualizationDocument
  future: ReportVisualizationDocument[]
}

// Object.is keeps an incomplete numeric field (NaN) distinct from a real null
// data value. JSON.stringify would silently make those two edits look equal.
export function reportDraftsEqual(left: unknown, right: unknown): boolean {
  const pending: Array<[unknown, unknown]> = [[left, right]]
  while (pending.length) {
    const [a, b] = pending.pop()!
    if (Object.is(a, b)) continue
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
    const aKeys = Object.keys(a), bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length || aKeys.some((key) => !Object.hasOwn(b, key))) return false
    for (const key of aKeys) pending.push([(a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]])
  }
  return true
}

export function createReportHistory(document: ReportVisualizationDocument): ReportHistory {
  return { past: [], present: structuredClone(document), future: [] }
}

export function commitReportHistory(history: ReportHistory, document: ReportVisualizationDocument): ReportHistory {
  if (reportDraftsEqual(history.present, document)) return history
  return { past: [...history.past, history.present].slice(-20), present: structuredClone(document), future: [] }
}

export function undoReportHistory(history: ReportHistory): ReportHistory {
  if (!history.past.length) return history
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future].slice(0, 20) }
}

export function redoReportHistory(history: ReportHistory): ReportHistory {
  if (!history.future.length) return history
  return { past: [...history.past, history.present].slice(-20), present: history.future[0], future: history.future.slice(1) }
}
