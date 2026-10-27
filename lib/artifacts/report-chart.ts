import type { ChartSpec, ReportBlock } from "@/packages/domain/entities"

const COLORS = ["#ff6f4d", "#7cd3ff", "#3c8f5b", "#a15cff", "#ffbf69", "#2563eb"]
const WIDTH = 560, HEIGHT = 300, LEFT = 64, RIGHT = 16, TOP = 20, BOTTOM = 56

function html(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function number(value: number): string { return String(Number(value.toFixed(6))) }
function color(chart: ChartSpec, index: number): string { return chart.series[index].color ?? COLORS[index % COLORS.length] }
function cssColor(value: string): string {
  return value.replace(/[<>{};\\]/g, (character) => `\\${character.charCodeAt(0).toString(16)} `).replace(/[\r\n]/g, " ")
}
function category(chart: ChartSpec, key: string | undefined, index: number): string {
  const value = key === undefined ? undefined : chart.data[index][key]
  return value === undefined ? String(index + 1) : value === null ? "Empty" : String(value)
}

function dataTable(chart: ChartSpec, categoryKey: string | undefined): string {
  const keys = [...new Set([
    ...(categoryKey === undefined ? [] : [categoryKey]),
    ...chart.series.map((series) => series.key),
    ...[...new Set(chart.data.flatMap((row) => Object.keys(row)))].sort(),
  ])]
  const heading = (key: string) => {
    const labels = chart.series.filter((series) => series.key === key).map((series) => series.label)
    return labels.length ? `${labels.map(html).join(" / ")} <small>(${html(key)})</small>` : html(key)
  }
  const rows = chart.data.map((row, index) => `<tr><th scope="row">${index + 1}</th>${keys.map((key) => {
    const present = Object.hasOwn(row, key), value = row[key]
    const type = !present ? "missing" : value === null ? "null" : typeof value
    const text = !present ? "Missing" : value === null ? "Empty" : String(value)
    return `<td data-column-key="${html(key)}" data-value-type="${type}">${html(text)}</td>`
  }).join("")}</tr>`).join("")
  return `<table class="chart-data"><caption>Data: ${html(chart.title)}</caption><thead><tr><th scope="col">Row</th>${keys.map((key) => `<th scope="col">${heading(key)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`
}

function seriesLegend(chart: ChartSpec): string {
  return `<ul class="chart-legend" aria-label="Chart series">${chart.series.map((series, index) => {
    const mark = chart.type === "composed" ? index === 0 ? "bars" : "line" : chart.type
    return `<li data-series-key="${html(series.key)}" data-mark="${mark}"><span class="chart-swatch" aria-hidden="true" style="background:${html(cssColor(color(chart, index)))}"></span>${html(series.label)}${chart.type === "composed" ? ` (${mark})` : ""}</li>`
  }).join("")}</ul>`
}

function invalidData(chart: ChartSpec, categoryKey: string | undefined): string | null {
  if (!chart.series.length) return "No chart series were supplied."
  const keys = new Set<string>()
  for (const series of chart.series) {
    if (!series.key.trim() || keys.has(series.key)) return "Chart series keys are missing or duplicated."
    keys.add(series.key)
    for (const row of chart.data) {
      if (!Object.hasOwn(row, series.key)) return "A chart row is missing a series value."
      const value = row[series.key]
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) return "Series values must be finite numbers or empty values."
    }
  }
  if (categoryKey !== undefined && chart.data.some((row) => !Object.hasOwn(row, categoryKey))) return "A chart row is missing its category value."
  return null
}

function cartesian(chart: ChartSpec, categoryKey: string | undefined): string {
  const innerWidth = WIDTH - LEFT - RIGHT, innerHeight = HEIGHT - TOP - BOTTOM
  let magnitude = 0, numeric = false
  for (const row of chart.data) for (const series of chart.series) {
    const value = row[series.key]
    if (typeof value === "number") { magnitude = Math.max(magnitude, Math.abs(value)); numeric = true }
  }
  if (!numeric) return `<p class="chart-unavailable">Chart unavailable. No numeric chart values were supplied.</p>`
  if (magnitude === 0) magnitude = 1
  let minimum = 0, maximum = 0
  for (const row of chart.data) for (const series of chart.series) {
    const value = row[series.key]
    if (typeof value === "number") { minimum = Math.min(minimum, value / magnitude); maximum = Math.max(maximum, value / magnitude) }
  }
  if (minimum === maximum) maximum = minimum + 1
  const y = (value: number) => TOP + (maximum - value / magnitude) / (maximum - minimum) * innerHeight
  const zero = y(0), step = innerWidth / chart.data.length
  const x = (index: number) => LEFT + (index + 0.5) * step
  const axisLabel = (value: number) => value !== 0 && (Math.abs(value) >= 1_000_000 || Math.abs(value) < 0.001) ? value.toExponential(2) : String(Number(value.toPrecision(4)))
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4, position = TOP + ratio * innerHeight
    const value = (maximum - ratio * (maximum - minimum)) * magnitude
    return `<g class="chart-tick"><line x1="${LEFT}" y1="${number(position)}" x2="${WIDTH - RIGHT}" y2="${number(position)}" stroke="var(--border)"></line><text x="${LEFT - 8}" y="${number(position + 4)}" text-anchor="end">${html(axisLabel(value))}</text></g>`
  }).join("")
  const stride = Math.max(1, Math.ceil(chart.data.length / 8))
  const labels = chart.data.map((_, index) => index % stride !== 0 && index !== chart.data.length - 1 ? "" : `<text x="${number(x(index))}" y="${HEIGHT - BOTTOM + 22}" text-anchor="middle"><title>${html(category(chart, categoryKey, index))}</title>${html(category(chart, categoryKey, index).slice(0, 18))}</text>`).join("")
  const barCount = chart.type === "bar" ? chart.series.length : 1
  const barWidth = step * 0.75 / barCount
  const marks = chart.series.map((series, seriesIndex) => {
    const mark = chart.type === "composed" ? seriesIndex === 0 ? "bar" : "line" : chart.type
    const stroke = html(color(chart, seriesIndex))
    let content: string
    if (mark === "bar") {
      content = chart.data.map((row, index) => {
        const value = row[series.key]
        if (value === null) return ""
        const numericValue = value as number, position = y(numericValue)
        const left = x(index) - step * 0.375 + (chart.type === "bar" ? seriesIndex : 0) * barWidth
        return `<rect class="chart-bar" data-row-index="${index}" data-value="${numericValue}" x="${number(left)}" y="${number(Math.min(zero, position))}" width="${number(barWidth)}" height="${number(Math.abs(position - zero))}" fill="${stroke}"><title>${html(series.label)}; ${html(category(chart, categoryKey, index))}: ${numericValue}</title></rect>${numericValue === 0 ? `<line class="chart-zero" data-row-index="${index}" x1="${number(left)}" y1="${number(zero)}" x2="${number(left + barWidth)}" y2="${number(zero)}" stroke="${stroke}" stroke-width="2"></line>` : ""}`
      }).join("")
    } else {
      const segments: Array<Array<{ index: number; value: number }>> = []
      let segment: Array<{ index: number; value: number }> = []
      for (const [index, row] of chart.data.entries()) {
        const value = row[series.key]
        if (value === null) { if (segment.length) segments.push(segment); segment = [] }
        else segment.push({ index, value: value as number })
      }
      if (segment.length) segments.push(segment)
      content = segments.map((points) => {
        const first = points[0], last = points[points.length - 1]
        const line = points.map((point, index) => `${index ? "L" : "M"}${number(x(point.index))},${number(y(point.value))}`).join(" ")
        const area = `M${number(x(first.index))},${number(zero)} ${line.replace(/^M/, "L")} L${number(x(last.index))},${number(zero)} Z`
        const path = mark === "area" ? `<path class="chart-area" data-start-row="${first.index}" data-end-row="${last.index}" d="${area}" fill="${stroke}" fill-opacity="0.15"></path>` : ""
        return `${path}<path class="chart-line" data-start-row="${first.index}" data-end-row="${last.index}" d="${line}" fill="none" stroke="${stroke}" stroke-width="2"></path>${points.map((point) => `<circle class="chart-point" data-row-index="${point.index}" data-value="${point.value}" cx="${number(x(point.index))}" cy="${number(y(point.value))}" r="3" fill="${stroke}"><title>${html(series.label)}; ${html(category(chart, categoryKey, point.index))}: ${point.value}</title></circle>`).join("")}`
      }).join("")
    }
    return `<g data-series-key="${html(series.key)}" data-series-index="${seriesIndex}" data-mark="${mark}">${content}</g>`
  }).join("")
  return `<svg class="chart-plot" data-zero-y="${number(zero)}" role="img" aria-label="${html(chart.accessibleLabel || chart.title)}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><title>${html(chart.title)}</title><desc>${html(chart.description)} Values and empty cells are listed in the following data table.</desc>${ticks}<line class="chart-baseline" x1="${LEFT}" y1="${number(zero)}" x2="${WIDTH - RIGHT}" y2="${number(zero)}" stroke="currentColor"></line>${marks}${labels}</svg>`
}

function radial(chart: ChartSpec, categoryKey: string | undefined): string {
  return chart.series.map((series, seriesIndex) => {
    let maximum = 0, negative = false
    for (const row of chart.data) {
      const value = row[series.key]
      if (typeof value === "number") { maximum = Math.max(maximum, value); if (value < 0) negative = true }
    }
    const heading = `<h4>${html(series.label)}</h4>`
    if (negative || maximum === 0) return `<section class="chart-facet" data-series-key="${html(series.key)}">${heading}<p class="chart-unavailable">Chart unavailable. ${negative ? "Pie and donut values must be nonnegative." : "This series has no positive values."}</p></section>`
    let total = 0
    for (const row of chart.data) { const value = row[series.key]; if (typeof value === "number") total += value / maximum }
    const cx = 160, cy = 140, outer = 104, inner = chart.type === "donut" ? 58 : 0
    const position = (angle: number, radius: number) => `${number(cx + Math.cos(angle) * radius)},${number(cy + Math.sin(angle) * radius)}`
    let angle = -Math.PI / 2
    const slices = chart.data.map((row, index) => {
      const value = row[series.key]
      if (value === null || value === 0) return ""
      const numericValue = value as number, fraction = (numericValue / maximum) / total
      if (fraction === 0) return ""
      const end = angle + fraction * 2 * Math.PI, fill = COLORS[index % COLORS.length]
      const title = `${html(series.label)}; ${html(category(chart, categoryKey, index))}: ${numericValue}`
      const attributes = `class="chart-slice" data-row-index="${index}" data-value="${numericValue}" fill="${fill}"`
      let slice: string
      if (fraction === 1 && inner === 0) slice = `<circle ${attributes} cx="${cx}" cy="${cy}" r="${outer}"><title>${title}</title></circle>`
      else {
        const large = fraction > 0.5 ? 1 : 0
        const outerArc = fraction === 1
          ? `M${position(angle, outer)} A${outer},${outer} 0 1 1 ${position(angle + Math.PI, outer)} A${outer},${outer} 0 1 1 ${position(end, outer)}`
          : `M${position(angle, outer)} A${outer},${outer} 0 ${large} 1 ${position(end, outer)}`
        const path = inner === 0 ? `${outerArc} L${cx},${cy} Z` : fraction === 1
          ? `${outerArc} Z M${position(angle, inner)} A${inner},${inner} 0 1 0 ${position(angle + Math.PI, inner)} A${inner},${inner} 0 1 0 ${position(end, inner)} Z`
          : `${outerArc} L${position(end, inner)} A${inner},${inner} 0 ${large} 0 ${position(angle, inner)} Z`
        slice = `<path ${attributes} d="${path}" fill-rule="evenodd"><title>${title}</title></path>`
      }
      angle = end
      return slice
    }).join("")
    const legend = `<ul class="chart-legend" aria-label="${html(series.label)} categories">${chart.data.map((row, index) => `<li><span class="chart-swatch" aria-hidden="true" style="background:${COLORS[index % COLORS.length]}"></span>${html(category(chart, categoryKey, index))}: ${row[series.key] === null ? "Empty" : html(String(row[series.key]))}</li>`).join("")}</ul>`
    return `<section class="chart-facet" data-series-key="${html(series.key)}">${heading}<svg class="chart-${chart.type}" role="img" aria-label="${html(chart.accessibleLabel || chart.title)} — ${html(series.label)}" viewBox="0 0 320 280" xmlns="http://www.w3.org/2000/svg"><title>${html(chart.title)} — ${html(series.label)}</title><desc>${html(chart.description)} Values and empty cells are listed in the following data table.</desc>${slices}</svg>${legend}</section>`
  }).join("")
}

export function renderReportChart(block: Extract<ReportBlock, { kind: "chart" }>): string {
  const chart = block.chart
  const categoryKey = chart.xKey ?? Object.keys(chart.data[0] ?? {})[0]
  const invalid = invalidData(chart, categoryKey)
  const plot = !chart.data.length ? `<p class="chart-unavailable">No chart data available.</p>`
    : invalid ? `<p class="chart-unavailable">Chart unavailable. ${html(invalid)}</p>`
      : chart.type === "pie" || chart.type === "donut" ? radial(chart, categoryKey) : cartesian(chart, categoryKey)
  return `<figure class="chart" id="${html(block.id)}" data-chart-type="${chart.type}"><figcaption><strong>${html(chart.title)}</strong><span>${html(chart.description)}</span></figcaption>${seriesLegend(chart)}${plot}${chart.illustrative ? `<p class="chart-illustrative">Illustrative values.</p>` : ""}${chart.provenance ? `<p class="chart-provenance">${html(chart.provenance)}</p>` : ""}${chart.source ? `<p class="chart-source">Source: ${html(chart.source)}</p>` : ""}${dataTable(chart, categoryKey)}</figure>`
}

export const REPORT_CHART_CSS = `.chart-legend{display:flex;flex-wrap:wrap;gap:.5rem 1rem;list-style:none;padding:0}.chart-legend li{display:flex;align-items:center;gap:.4rem}.chart-swatch{display:inline-block;width:.75rem;height:.75rem;flex:0 0 auto;border:1px solid var(--border)}.chart-plot,.chart-pie,.chart-donut{display:block;width:100%;height:auto}.chart-plot text{font-size:11px;fill:currentColor}.chart-data{table-layout:fixed}.chart-data caption{text-align:left;font-weight:600;padding:.5rem 0}.chart-data th,.chart-data td{overflow-wrap:anywhere}.chart-data small{display:block;font-weight:normal}.chart-facet{margin:1rem 0}.chart-facet h4{margin:.5rem 0}.chart-unavailable{padding:.75rem;border:1px solid var(--border)}`
