import type { ChartSpec } from "@/packages/domain/entities"
import { reportChartCategoryKey } from "./report-chart-model"

// Recharts merges Cell props and generated name/value/payload fields into pie
// rows. Enumerable symbols survive that spread without colliding with source keys.
const SOURCE_ROW = Symbol("report-chart-source-row")
const SOURCE_INDEX = Symbol("report-chart-source-index")
type SourceRow = ChartSpec["data"][number]
type PlotRow = { [SOURCE_ROW]: SourceRow; [SOURCE_INDEX]: number }
type PlotKey = (payload: unknown) => number | null

export interface ReportChartProjection {
  data: PlotRow[]
  dataKeys: PlotKey[]
  categoryDataKey: (payload: unknown) => string | number | null | undefined
  factor: number
  tickLabel: (value: number | string) => string
  tooltipValue: <T>(fallback: T, dataKey: unknown, payload: unknown) => T | number | string
}

function sourceRow(payload: unknown): SourceRow | null {
  if (!payload || typeof payload !== "object") return null
  const row = (payload as Partial<PlotRow>)[SOURCE_ROW]
  return row && typeof row === "object" && !Array.isArray(row) ? row : null
}

function exponentProduct(left: number, right: number): string {
  const [a, aExponent] = left.toExponential(16).split("e")
  const [b, bExponent] = right.toExponential(16).split("e")
  const [mantissa, adjustment] = (Number(a) * Number(b)).toExponential(2).split("e")
  const exponent = Number(aExponent) + Number(bExponent) + Number(adjustment)
  return `${mantissa}e${exponent >= 0 ? "+" : ""}${exponent}`
}

function tickLabel(value: number | string, factor: number): string {
  const normalized = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(normalized)) return "—"
  if (normalized === 0) return "0"
  const raw = normalized * factor
  if (!Number.isFinite(raw) || raw === 0) return exponentProduct(normalized, factor)
  return Math.abs(raw) >= 1_000_000 || Math.abs(raw) < 0.001 ? raw.toExponential(2) : String(Number(raw.toPrecision(4)))
}

export function createReportChartProjection(spec: ChartSpec, seriesIndices?: number[]): ReportChartProjection {
  const selected = seriesIndices ?? spec.series.map((_, index) => index)
  if (selected.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= spec.series.length)) {
    throw new Error("Choose an existing chart series for plotting.")
  }
  const radial = spec.type === "pie" || spec.type === "donut"
  const maxima = spec.series.map(() => 0)
  for (const row of spec.data) for (const [index, series] of spec.series.entries()) {
    const value = row[series.key]
    if (typeof value === "number" && Number.isFinite(value)) maxima[index] = Math.max(maxima[index], Math.abs(value))
  }
  const maximum = (radial ? selected.map((index) => maxima[index]) : maxima).reduce((largest, value) => Math.max(largest, value), 0)
  const factor = maximum || 1
  const data = spec.data.map((row, index) => ({ [SOURCE_ROW]: row, [SOURCE_INDEX]: index }))
  const keys = new Map<PlotKey, string>()
  const dataKeys = spec.series.map((series, index) => {
    const divisor = radial ? maxima[index] || 1 : factor
    const key: PlotKey = (payload) => {
      const row = sourceRow(payload)
      if (!row || !Object.hasOwn(row, series.key)) return null
      const value = row[series.key]
      return typeof value === "number" && Number.isFinite(value) ? value / divisor : null
    }
    keys.set(key, series.key)
    return key
  })
  const category = reportChartCategoryKey(spec)
  return {
    data, dataKeys, factor,
    categoryDataKey(payload) {
      const row = sourceRow(payload)
      if (!row) return undefined
      return category === undefined ? (payload as PlotRow)[SOURCE_INDEX] + 1 : row[category] === null ? "Empty" : row[category]
    },
    tickLabel: (value) => tickLabel(value, factor),
    tooltipValue<T>(_fallback: T, dataKey: unknown, payload: unknown): T | number | string {
      const key = keys.get(dataKey as PlotKey), row = sourceRow(payload)
      // A fallback may be a normalized fraction, so it is not evidence of a raw observation.
      if (key === undefined || !row || !Object.hasOwn(row, key)) return "Unavailable"
      const value = row[key]
      if (value === null) return "Empty"
      return typeof value === "number" && Number.isFinite(value) ? value : "Unavailable"
    },
  }
}
