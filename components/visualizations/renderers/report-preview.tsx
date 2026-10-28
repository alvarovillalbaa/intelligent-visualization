"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { ChartSpec, ReportBlock, ReportVisualizationDocument } from "@/packages/domain/entities"
import {
  REPORT_CHART_COLORS,
  reportChartCategoryKey,
  reportChartColumns,
  reportChartProblem,
  reportRadialProblem,
  reportSeriesColor,
} from "@/lib/client/report-chart-model"
import { createReportChartProjection } from "@/lib/client/report-chart-projection"
import { REPORT_GRID_COLUMNS, REPORT_GRID_GAP, REPORT_GRID_ROW_HEIGHT, type ReportBreakpoint } from "@/lib/client/report-grid"

function zeroInclusiveDomain([minimum, maximum]: [number, number]): [number, number] {
  return [Math.min(0, minimum), Math.max(0, maximum)]
}

function ChartDataTable({ spec, categoryKey }: { spec: ChartSpec; categoryKey: string | undefined }) {
  const keys = reportChartColumns(spec, categoryKey)
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="py-2 text-left font-semibold">Data: {spec.title}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b px-3 py-2 text-left" style={{ borderColor: "var(--iv-border)" }}>Row</th>
            {keys.map((key) => {
              const labels = spec.series.filter((series) => series.key === key).map((series) => series.label)
              return <th key={key} scope="col" className="break-words border-b px-3 py-2 text-left" style={{ borderColor: "var(--iv-border)" }}>
                {labels.length ? <>{labels.join(" / ")}<small className="block font-normal">({key})</small></> : key}
              </th>
            })}
          </tr>
        </thead>
        <tbody>
          {spec.data.map((row, index) => <tr key={index}>
            <th scope="row" className="border-b px-3 py-2 text-left font-normal" style={{ borderColor: "var(--iv-border)" }}>{index + 1}</th>
            {keys.map((key) => {
              const present = Object.hasOwn(row, key), value = row[key]
              const type = !present ? "missing" : value === null ? "null" : typeof value
              const text = !present ? "Missing" : value === null ? "Empty" : String(value)
              return <td key={key} data-column-key={key} data-value-type={type} className="break-words border-b px-3 py-2 align-top" style={{ borderColor: "var(--iv-border)" }}>{text}</td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
  )
}

function ChartBlock({ spec }: { spec: ChartSpec }) {
  const empty = spec.data.length === 0 || spec.series.length === 0
  const xKey = reportChartCategoryKey(spec)
  const problem = empty ? null : reportChartProblem(spec)
  const hasChart = !empty && !problem
  const radial = spec.type === "pie" || spec.type === "donut"
  const projection = createReportChartProjection(spec)
  let chart: React.ReactNode = null

  if (hasChart && spec.type === "line") {
    chart = (
      <LineChart data={projection.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--iv-border)" />
        <XAxis dataKey={projection.categoryDataKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={40} domain={zeroInclusiveDomain} tickFormatter={projection.tickLabel} />
        <Tooltip formatter={(value, _name, item) => projection.tooltipValue(value, item.dataKey, item.payload)} />
        {spec.series.map((series, index) => (
          <Line key={series.key} type="linear" dataKey={projection.dataKeys[index]} name={series.label} stroke={reportSeriesColor(spec, index)} dot={{ r: 3 }} connectNulls={false} strokeWidth={2} />
        ))}
      </LineChart>
    )
  } else if (hasChart && spec.type === "area") {
    chart = (
      <AreaChart data={projection.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--iv-border)" />
        <XAxis dataKey={projection.categoryDataKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={40} domain={zeroInclusiveDomain} tickFormatter={projection.tickLabel} />
        <Tooltip formatter={(value, _name, item) => projection.tooltipValue(value, item.dataKey, item.payload)} />
        {spec.series.map((series, index) => (
          <Area key={series.key} type="linear" dataKey={projection.dataKeys[index]} name={series.label} stroke={reportSeriesColor(spec, index)} fill={reportSeriesColor(spec, index)} fillOpacity={0.25} dot={{ r: 3 }} connectNulls={false} baseValue={0} />
        ))}
      </AreaChart>
    )
  } else if (hasChart && spec.type === "composed") {
    chart = (
      <ComposedChart data={projection.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--iv-border)" />
        <XAxis dataKey={projection.categoryDataKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={40} domain={zeroInclusiveDomain} tickFormatter={projection.tickLabel} />
        <Tooltip formatter={(value, _name, item) => projection.tooltipValue(value, item.dataKey, item.payload)} />
        {spec.series.map((series, index) => index === 0 ? (
          <Bar key={series.key} dataKey={projection.dataKeys[index]} name={series.label} fill={reportSeriesColor(spec, index)} minPointSize={0} />
        ) : (
          <Line key={series.key} type="linear" dataKey={projection.dataKeys[index]} name={series.label} stroke={reportSeriesColor(spec, index)} dot={{ r: 3 }} connectNulls={false} strokeWidth={2} />
        ))}
      </ComposedChart>
    )
  } else if (hasChart && spec.type === "bar") {
    chart = (
      <BarChart data={projection.data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--iv-border)" />
        <XAxis dataKey={projection.categoryDataKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={40} domain={zeroInclusiveDomain} tickFormatter={projection.tickLabel} />
        <Tooltip formatter={(value, _name, item) => projection.tooltipValue(value, item.dataKey, item.payload)} />
        {spec.series.map((series, index) => (
          <Bar key={series.key} dataKey={projection.dataKeys[index]} name={series.label} fill={reportSeriesColor(spec, index)} minPointSize={0} />
        ))}
      </BarChart>
    )
  }

  return (
    <figure className="grid min-w-0 gap-2" data-chart-type={spec.type}>
      <figcaption>
        <p className="text-sm font-semibold">{spec.title}</p>
        {spec.description ? <p className="mt-1 text-sm leading-6 opacity-70">{spec.description}</p> : null}
      </figcaption>
      {spec.series.length ? <ul aria-label="Chart series" className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {spec.series.map((series, index) => {
          const mark = spec.type === "composed" ? index === 0 ? "bars" : "line" : spec.type
          return <li key={`${series.key}:${index}`} data-series-key={series.key} data-mark={mark} className="flex min-w-0 items-center gap-2 break-words">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-sm border" style={{ backgroundColor: reportSeriesColor(spec, index), borderColor: "var(--iv-border)" }} />
            <span>{series.label}{spec.type === "composed" ? ` (${mark})` : ""}</span>
          </li>
        })}
      </ul> : null}
      {hasChart && radial ? (
        <div className="grid min-w-0 gap-5">
          {spec.series.map((series, seriesIndex) => {
            const radialProblem = reportRadialProblem(spec, seriesIndex)
            const facetProjection = createReportChartProjection(spec, [seriesIndex])
            const label = spec.series.length === 1 ? spec.accessibleLabel || spec.title : `${spec.accessibleLabel || spec.title} — ${series.label}`
            return <section key={series.key} data-series-key={series.key} className="grid min-w-0 gap-2">
              <h4 className="text-sm font-semibold">{series.label}</h4>
              {radialProblem ? <p className="text-sm opacity-70">Chart unavailable. {radialProblem}</p> : (
                <div className="h-64 w-full" role="img" aria-label={label}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={facetProjection.data} dataKey={facetProjection.dataKeys[seriesIndex]} nameKey={facetProjection.categoryDataKey} innerRadius={spec.type === "donut" ? "55%" : 0} outerRadius="85%">
                        {spec.data.map((_, index) => <Cell key={index} fill={REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value, _name, item) => facetProjection.tooltipValue(value, item.dataKey, item.payload)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul aria-label={`${series.label} categories`} className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                {spec.data.map((row, index) => {
                  const category = xKey === undefined ? String(index + 1) : row[xKey] === null ? "Empty" : String(row[xKey])
                  return <li key={index} className="flex min-w-0 items-center gap-2 break-words">
                    <span aria-hidden="true" className="size-3 shrink-0 rounded-sm border" style={{ backgroundColor: REPORT_CHART_COLORS[index % REPORT_CHART_COLORS.length], borderColor: "var(--iv-border)" }} />
                    <span>{category}: {row[series.key] === null ? "Empty" : String(row[series.key])}</span>
                  </li>
                })}
              </ul>
            </section>
          })}
        </div>
      ) : chart ? (
        <div className="h-64 w-full" role="img" aria-label={spec.accessibleLabel || spec.title}>
          <ResponsiveContainer width="100%" height="100%">
            {chart as React.ReactElement}
          </ResponsiveContainer>
        </div>
      ) : <p className="text-sm opacity-70">{problem ? `Chart unavailable. ${problem}` : "No chart data available."}</p>}
      {spec.illustrative ? <p className="text-xs font-medium">Illustrative values.</p> : null}
      {spec.provenance ? <p className="break-words text-xs leading-5 opacity-70">{spec.provenance}</p> : null}
      {spec.source ? <p className="text-xs opacity-60">Source: {spec.source}</p> : null}
      <ChartDataTable spec={spec} categoryKey={xKey} />
    </figure>
  )
}

export function ReportBlockView({ block }: { block: ReportBlock }) {
  switch (block.kind) {
    case "heading": {
      if (block.level === 1) {
        return (
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--iv-display-font)" }}>
            {block.text}
          </h2>
        )
      }
      if (block.level === 2) {
        return (
          <h3 className="text-xl font-semibold" style={{ fontFamily: "var(--iv-display-font)" }}>
            {block.text}
          </h3>
        )
      }
      return <h4 className="text-lg font-semibold">{block.text}</h4>
    }
    case "rich-text":
      return <p className="whitespace-pre-wrap break-words leading-7 opacity-90">{block.text}</p>
    case "callout":
      return (
        <div className="rounded-lg border-l-4 p-4" style={{ borderColor: "var(--iv-accent)", backgroundColor: "var(--iv-muted)" }}>
          <p className="text-sm font-semibold">{block.title}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 opacity-90">{block.body}</p>
        </div>
      )
    case "quote":
      return (
        <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-4 italic leading-7 opacity-90" style={{ borderColor: "var(--iv-accent)" }}>
          “{block.quote}”
          <footer className="mt-2 text-sm not-italic opacity-70">{block.byline}</footer>
        </blockquote>
      )
    case "divider":
      return <hr style={{ borderColor: "var(--iv-border)" }} />
    case "kpi":
      return (
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--iv-border)" }}>
          <p className="text-xs uppercase tracking-[0.16em] opacity-60">{block.label}</p>
          <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--iv-accent)" }}>
            {block.value}
          </p>
          <p className="mt-1 text-sm leading-6 opacity-70">{block.detail}</p>
          {block.provenance ? <p className="mt-2 break-words text-xs leading-5 opacity-70">{block.provenance}</p> : null}
        </div>
      )
    case "chart":
      return <ChartBlock spec={block.chart} />
    case "data-table":
      return (
        <div className="grid gap-2 overflow-x-auto">
          <p className="text-sm font-semibold">{block.title}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.columns.map((column, index) => (
                  <th key={index} className="border-b px-3 py-2 text-left font-medium" style={{ borderColor: "var(--iv-border)" }}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b px-3 py-2 opacity-90" style={{ borderColor: "var(--iv-border)" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.provenance ? <p className="break-words text-xs leading-5 opacity-70">{block.provenance}</p> : null}
        </div>
      )
    case "tabs":
      return (
        <div className="grid gap-6">
          {block.tabs.map((tab) => (
            <div key={tab.id} className="grid gap-4">
              <p className="text-xs uppercase tracking-[0.2em] opacity-60">{tab.label}</p>
              {tab.blocks.map((child) => (
                <ReportBlockView key={child.id} block={child} />
              ))}
            </div>
          ))}
        </div>
      )
    case "image":
      return block.alt || block.caption ? <div className="grid gap-2 text-sm italic opacity-70">
        {block.alt ? <p>{block.alt}</p> : null}
        {block.caption ? <p>{block.caption}</p> : null}
      </div> : null
    case "list":
      return (
        <ul className="grid gap-2">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2 leading-7">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--iv-accent)" }} />
              {item}
            </li>
          ))}
        </ul>
      )
    case "timeline":
      return (
        <ol className="grid gap-3 border-l pl-5" style={{ borderColor: "var(--iv-border)" }}>
          {block.items.map((item, index) => (
            <li key={index} className="relative">
              <span
                className="absolute -left-[26px] top-1.5 size-2.5 rounded-full"
                style={{ backgroundColor: "var(--iv-accent)" }}
              />
              <p className="font-medium">{item.label}</p>
              <p className="text-sm leading-6 opacity-70">{item.detail}</p>
            </li>
          ))}
        </ol>
      )
    case "comparison":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {block.columns.map((column, index) => (
            <div key={index} className="rounded-lg border p-4" style={{ borderColor: "var(--iv-border)" }}>
              <p className="text-sm font-semibold">{column.label}</p>
              <p className="mt-2 text-sm leading-6 opacity-80">{column.body}</p>
            </div>
          ))}
        </div>
      )
    case "source-note":
      return <p className="whitespace-pre-wrap break-words text-xs leading-5 opacity-60">{block.text}</p>
    case "cta":
      return (
        <div className="grid justify-items-start gap-2"><a
          href={block.cta.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 w-fit items-center rounded-full px-5 text-sm font-medium"
          style={{ backgroundColor: "var(--iv-accent)", color: "var(--iv-background)" }}
        >
          {block.cta.label}
        </a>
        {block.cta.helperText ? <p className="text-sm leading-6 opacity-70">{block.cta.helperText}</p> : null}</div>
      )
    default:
      return null
  }
}

// Legacy/generated reports can have empty layouts. Keep those reports readable
// in source order until the authoring preparer supplies complete placements.
function hasGridLayouts(report: ReportVisualizationDocument["report"]) {
  return (Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]).every((breakpoint) => {
    const items = report.layouts?.[breakpoint]
    if (!Array.isArray(items) || items.length !== report.blocks.length) return false
    const seen = new Set<string>()
    return items.every((item, index) => {
      if (seen.has(item.blockId) || !report.blocks.some((block) => block.id === item.blockId)) return false
      seen.add(item.blockId)
      const { x, y, w, h } = item
      if (![x, y, w, h].every(Number.isSafeInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > REPORT_GRID_COLUMNS[breakpoint] || y + h > 256) return false
      return !items.slice(0, index).some((other) => x < other.x + other.w && other.x < x + w && y < other.y + other.h && other.y < y + h)
    })
  })
}

export function ReportPreview({ document, breakpoint }: { document: ReportVisualizationDocument; breakpoint?: ReportBreakpoint }) {
  const { theme, report } = document
  const grid = hasGridLayouts(report)

  return (
    <div
      className="min-h-full"
      style={
        {
          backgroundColor: theme.background,
          color: theme.foreground,
          fontFamily: theme.bodyFont,
          containerType: "inline-size",
          containerName: "iv-report",
          "--iv-accent": theme.accent,
          "--iv-muted": theme.muted,
          "--iv-border": theme.border,
          "--iv-background": theme.background,
          "--iv-display-font": theme.displayFont,
        } as React.CSSProperties
      }
    >
      <style>{`
        .iv-report-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); grid-auto-rows:${REPORT_GRID_ROW_HEIGHT}px; gap:${REPORT_GRID_GAP}px; }
        .iv-report-cell { grid-column:var(--iv-sm-x) / span var(--iv-sm-w); grid-row:var(--iv-sm-y) / span var(--iv-sm-h); }
        @container iv-report (min-width:768px) {
          .iv-report-grid:not([data-breakpoint]) { grid-template-columns:repeat(8,minmax(0,1fr)); }
          .iv-report-grid:not([data-breakpoint]) > .iv-report-cell { grid-column:var(--iv-md-x) / span var(--iv-md-w); grid-row:var(--iv-md-y) / span var(--iv-md-h); }
        }
        @container iv-report (min-width:1024px) {
          .iv-report-grid:not([data-breakpoint]) { grid-template-columns:repeat(12,minmax(0,1fr)); }
          .iv-report-grid:not([data-breakpoint]) > .iv-report-cell { grid-column:var(--iv-lg-x) / span var(--iv-lg-w); grid-row:var(--iv-lg-y) / span var(--iv-lg-h); }
        }
        .iv-report-grid[data-breakpoint="md"] { grid-template-columns:repeat(8,minmax(0,1fr)); }
        .iv-report-grid[data-breakpoint="md"] > .iv-report-cell { grid-column:var(--iv-md-x) / span var(--iv-md-w); grid-row:var(--iv-md-y) / span var(--iv-md-h); }
        .iv-report-grid[data-breakpoint="lg"] { grid-template-columns:repeat(12,minmax(0,1fr)); }
        .iv-report-grid[data-breakpoint="lg"] > .iv-report-cell { grid-column:var(--iv-lg-x) / span var(--iv-lg-w); grid-row:var(--iv-lg-y) / span var(--iv-lg-h); }
      `}</style>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16">
        <header className="grid max-w-3xl gap-4 break-words">
          <p className="text-xs uppercase tracking-[0.2em] opacity-60">Report</p>
          <h1 className="text-4xl font-semibold leading-tight" style={{ fontFamily: theme.displayFont }}>
            {document.title}
          </h1>
          {document.subtitle ? <p className="text-xl leading-8 opacity-80">{document.subtitle}</p> : null}
          <p className="whitespace-pre-wrap text-lg leading-8 opacity-80">{document.summary}</p>
          {report.decisionQuestion ? (
            <p className="whitespace-pre-wrap rounded-lg p-4 text-sm font-medium leading-6" style={{ backgroundColor: theme.muted }}>
              {report.decisionQuestion}
            </p>
          ) : null}
          {report.executiveSummary ? <p className="whitespace-pre-wrap leading-7 opacity-90">{report.executiveSummary}</p> : null}
        </header>

        <div className={grid ? "iv-report-grid" : "grid gap-8"} data-breakpoint={grid ? breakpoint : undefined}>
          {report.blocks.map((block, index) => {
            const placement: Record<string, number> = {}
            if (grid) {
              for (const size of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
                const item = report.layouts[size].find((entry) => entry.blockId === block.id)!
                placement[`--iv-${size}-x`] = item.x + 1
                placement[`--iv-${size}-y`] = item.y + 1
                placement[`--iv-${size}-w`] = item.w
                placement[`--iv-${size}-h`] = item.h
              }
            }
            return (
              <section key={block.id} className={grid ? "iv-report-cell min-w-0 overflow-auto rounded-lg border border-transparent p-3 focus-visible:border-current focus-visible:outline-none" : "min-w-0"}
                aria-label={`Report block ${index + 1}: ${block.kind}`} tabIndex={grid ? 0 : undefined} style={placement as React.CSSProperties}>
                <ReportBlockView block={block} />
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
