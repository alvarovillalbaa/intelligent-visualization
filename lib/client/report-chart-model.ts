import type { ChartSpec } from "@/packages/domain/entities"

export const REPORT_CHART_COLORS = ["#ff6f4d", "#7cd3ff", "#3c8f5b", "#a15cff", "#ffbf69", "#2563eb"] as const

export function reportSeriesColor(spec: ChartSpec, index: number): string {
  return spec.series[index]?.color ?? REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length]
}

export function reportChartCategoryKey(spec: ChartSpec): string | undefined {
  return spec.xKey ?? Object.keys(spec.data[0] ?? {})[0]
}

export function reportChartColumns(spec: ChartSpec, categoryKey: string | undefined): string[] {
  return [...new Set([
    ...(categoryKey === undefined ? [] : [categoryKey]),
    ...spec.series.map((series) => series.key),
    ...[...new Set(spec.data.flatMap((row) => Object.keys(row)))].sort(),
  ])]
}

export function reportChartProblem(spec: ChartSpec): string | null {
  if (!spec.series.length) return "No chart series were supplied."
  const keys = new Set<string>()
  for (const series of spec.series) {
    if (!series.key.trim() || keys.has(series.key)) return "Chart series keys are missing or duplicated."
    keys.add(series.key)
    for (const row of spec.data) {
      if (!Object.hasOwn(row, series.key)) return "A chart row is missing a series value."
      const value = row[series.key]
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) return "Series values must be finite numbers or empty values."
    }
  }
  const categoryKey = reportChartCategoryKey(spec)
  if (categoryKey !== undefined && spec.data.some((row) => !Object.hasOwn(row, categoryKey))) return "A chart row is missing its category value."
  if (spec.data.length && spec.type !== "pie" && spec.type !== "donut"
    && !spec.data.some((row) => spec.series.some((series) => typeof row[series.key] === "number"))) {
    return "No numeric chart values were supplied."
  }
  return null
}

export function reportRadialProblem(spec: ChartSpec, seriesIndex: number): string | null {
  const series = spec.series[seriesIndex]
  if (!series) return "No chart series were supplied."
  let positive = false
  for (const row of spec.data) {
    const value = row[series.key]
    if (typeof value !== "number") continue
    if (value < 0) return "Pie and donut values must be nonnegative."
    if (value > 0) positive = true
  }
  return positive ? null : "This series has no positive values."
}
