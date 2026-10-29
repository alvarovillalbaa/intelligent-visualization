import { contentHash } from "@/packages/domain/serialization"
import type {
  ReportBlock,
  VisualizationDocument,
} from "@/packages/domain/entities"
import { migrateVisualizationDocument } from "@/packages/domain/migrations"
import { REPORT_ARTIFACT_CSS, reportArtifactLayout, reportArtifactPlacement } from "./report-grid"
import { REPORT_CHART_CSS, renderReportChart } from "./report-chart"
import { COURSE_ARTIFACT_CSS, courseRuntimeScript, renderCourse } from "./course"

export interface ArtifactCompileOptions {
  visualizationId: string
  versionId: string
  createdAt?: string
  assetBaseUrl?: string
  preview?: boolean
}

export interface ArtifactWarning {
  code: string
  message: string
  nodeId?: string
}

export interface ArtifactManifest extends Record<string, unknown> {
  visualizationId: string
  versionId: string
  kind: VisualizationDocument["kind"]
  schemaVersion: number
  documentHash: string
  artifactHash: string
  createdAt: string
  rendererVersion: string
  sourceHashes: string[]
  assetReferences: string[]
  runtimeFeatures: string[]
}

export interface CompiledArtifact {
  html: string
  manifest: ArtifactManifest
  contentHash: string
  warnings: ArtifactWarning[]
}

const RENDERER_VERSION = "visualization-html-v1"
const REPORT_RENDERER_VERSION = "visualization-report-html-v2"
const COURSE_RENDERER_VERSION = "visualization-course-html-v2"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function safeUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") {
      return "#"
    }
    return url.toString()
  } catch {
    return "#"
  }
}

function renderSlideBlock(block: Extract<VisualizationDocument, { kind: "slides" }>["slides"]["items"][number]["blocks"][number]) {
  switch (block.kind) {
    case "paragraph":
      return `<p>${escapeHtml(block.text)}</p>`
    case "bullets":
      return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    case "stats":
      return `<div class="stats">${block.items.map((item) => `<article><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail)}</small></article>`).join("")}</div>`
    case "quote":
      return `<blockquote>${escapeHtml(block.quote)}<footer>${escapeHtml(block.byline)}</footer></blockquote>`
    case "timeline":
      return `<ol class="timeline">${block.items.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.detail)}</p></li>`).join("")}</ol>`
    case "code":
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`
    case "callout":
      return `<aside class="callout"><strong>${escapeHtml(block.label)}</strong><p>${escapeHtml(block.value)}</p></aside>`
    case "image":
      return `<figure><div class="asset-placeholder">${escapeHtml(block.assetId)}</div><figcaption>${escapeHtml(block.caption ?? block.alt)}</figcaption></figure>`
    case "chart":
      return `<div class="chart-placeholder" role="img" aria-label="Chart ${escapeHtml(block.chartId)}">${escapeHtml(block.chartId)}</div>`
    default:
      return ""
  }
}

function renderSlides(document: Extract<VisualizationDocument, { kind: "slides" }>) {
  return `<main class="slides" data-navigation="${escapeHtml(document.slides.navigation)}">${document.slides.items
    .map(
      (slide, index) => `<section class="slide" id="${escapeHtml(slide.id)}" data-slide-index="${index}"><p class="kicker">${escapeHtml(slide.kicker)}</p><h2>${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.summary)}</p><div class="blocks">${slide.blocks.map(renderSlideBlock).join("")}</div></section>`,
    )
    .join("")}</main>`
}

function renderReportBlock(block: ReportBlock): string {
  switch (block.kind) {
    case "heading":
      return `<h${block.level} id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</h${block.level}>`
    case "rich-text":
      return `<p id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</p>`
    case "callout":
      return `<aside class="callout" id="${escapeHtml(block.id)}"><strong>${escapeHtml(block.title)}</strong><p>${escapeHtml(block.body)}</p></aside>`
    case "quote":
      return `<blockquote id="${escapeHtml(block.id)}">${escapeHtml(block.quote)}<footer>${escapeHtml(block.byline)}</footer></blockquote>`
    case "divider":
      return `<hr id="${escapeHtml(block.id)}" />`
    case "kpi":
      return `<article class="kpi" id="${escapeHtml(block.id)}"><span>${escapeHtml(block.label)}</span><strong>${escapeHtml(block.value)}</strong><small>${escapeHtml(block.detail)}</small><p>${escapeHtml(block.provenance)}</p></article>`
    case "chart":
      return renderReportChart(block)
    case "data-table":
      return `<figure id="${escapeHtml(block.id)}"><figcaption>${escapeHtml(block.title)}</figcaption><table><thead><tr>${block.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${block.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table><p>${escapeHtml(block.provenance)}</p></figure>`
    case "tabs":
      return `<section class="tabs" id="${escapeHtml(block.id)}">${block.tabs
        .map((tab) => `<article><h3>${escapeHtml(tab.label)}</h3>${tab.blocks.map(renderReportBlock).join("")}</article>`)
        .join("")}</section>`
    case "image":
      return `<figure id="${escapeHtml(block.id)}"><div class="asset-placeholder">Image unavailable</div>${block.alt ? `<p class="image-description">${escapeHtml(block.alt)}</p>` : ""}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}</figure>`
    case "list":
      return `<ul id="${escapeHtml(block.id)}">${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    case "timeline":
      return `<ol class="timeline" id="${escapeHtml(block.id)}">${block.items.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.detail)}</p></li>`).join("")}</ol>`
    case "comparison":
      return `<div class="comparison" id="${escapeHtml(block.id)}">${block.columns.map((column) => `<article><h3>${escapeHtml(column.label)}</h3><p>${escapeHtml(column.body)}</p></article>`).join("")}</div>`
    case "source-note":
      return `<p class="source-note" id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</p>`
    case "cta":
      return `<div class="report-link"><a class="cta" id="${escapeHtml(block.id)}" href="${escapeHtml(safeUrl(block.cta.href))}" rel="noopener noreferrer">${escapeHtml(block.cta.label)}</a>${block.cta.helperText ? `<p>${escapeHtml(block.cta.helperText)}</p>` : ""}</div>`
    default:
      return ""
  }
}

function renderReportSources(document: Extract<VisualizationDocument, { kind: "report" }>) {
  if (!document.sourceManifest.length && !document.report.dataSources.length) return ""
  const sources = document.sourceManifest.length
    ? `<section aria-label="Source records"><h3>Source records</h3><ul>${document.sourceManifest.map((source) => `<li><h4>${escapeHtml(source.label)}</h4><p>${escapeHtml(source.provenance)}</p><dl><dt>Supplied content hash</dt><dd>${escapeHtml(source.contentHash)}</dd></dl></li>`).join("")}</ul></section>`
    : ""
  const snapshots = document.report.dataSources.length
    ? `<section aria-label="Dataset snapshots"><h3>Dataset snapshots</h3><ul>${document.report.dataSources.map((source) => `<li><h4>${escapeHtml(source.label)}</h4><p>${escapeHtml(source.provenance)}</p><dl><dt>Supplied content hash</dt><dd>${escapeHtml(source.contentHash)}</dd>${source.rowCount !== undefined ? `<dt>Supplied row count</dt><dd>${source.rowCount}</dd>` : ""}</dl></li>`).join("")}</ul></section>`
    : ""
  return `<section class="report-sources" aria-label="Sources"><h2>Sources</h2>${sources}${snapshots}</section>`
}

function renderReport(document: Extract<VisualizationDocument, { kind: "report" }>, layout: ReturnType<typeof reportArtifactLayout>) {
  const context = document.report.decisionQuestion || document.report.executiveSummary
    ? `<section class="report-context" aria-label="Report context">${document.report.decisionQuestion ? `<p class="decision-question">${escapeHtml(document.report.decisionQuestion)}</p>` : ""}${document.report.executiveSummary ? `<p class="executive-summary">${escapeHtml(document.report.executiveSummary)}</p>` : ""}</section>`
    : ""
  const blocks = document.report.blocks.map((block, index) => {
    const placement = layout.placements ? ` tabindex="0" style="${reportArtifactPlacement(layout.placements, block.id)}"` : ""
    return `<section class="report-cell" data-report-block="${escapeHtml(block.id)}" aria-label="Report block ${index + 1}: ${block.kind}"${placement}>${renderReportBlock(block)}</section>`
  }).join("")
  return `<div class="report-artifact"><main class="report">${context}<div class="${layout.placements ? "report-grid" : "report-flow"}">${blocks}</div>${renderReportSources(document)}</main></div>`
}

function runtimeScript(preview = false) {
  if (preview) {
    return `<script>(()=>{const completed=new Set();document.querySelectorAll('.complete-lesson').forEach((button)=>{button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{const id=button.getAttribute('data-lesson-id');if(id&&!completed.has(id)){completed.add(id);button.textContent='Completed';button.setAttribute('aria-pressed','true')}})});document.querySelectorAll('.quiz').forEach((quiz)=>{const feedback=quiz.querySelector('.feedback');const explanation=feedback?feedback.textContent:'';quiz.addEventListener('change',()=>{const selected=quiz.querySelector('input:checked');if(feedback&&selected){feedback.hidden=false;feedback.setAttribute('role','status');feedback.textContent=(selected.value===quiz.getAttribute('data-answer')?'Correct. ':'Try again. ')+explanation}})})})();</script>`
  }
  return `<script>(()=>{const post=(type,payload={})=>{try{navigator.sendBeacon&&navigator.sendBeacon('/api/events',new Blob([JSON.stringify({type,publicId:document.body.dataset.publicId||'',...payload})],{type:'application/json'}))}catch{}};post('view');document.querySelectorAll('.complete-lesson').forEach((button)=>button.addEventListener('click',()=>{const id=button.getAttribute('data-lesson-id');if(id){localStorage.setItem('iv:lesson:'+id,'complete');post('course_lesson_complete',{nodeId:id,nodeKind:'course-lesson'})}}));document.querySelectorAll('.quiz').forEach((quiz)=>quiz.addEventListener('change',()=>{const feedback=quiz.querySelector('.feedback');if(feedback)feedback.hidden=false;post('course_quiz_answer',{nodeId:quiz.id,nodeKind:'course-block'})}))})();</script>`
}

function shell(document: VisualizationDocument, body: string, options: ArtifactCompileOptions) {
  const cta = document.engagement?.cta
    ? `<a class="floating-cta" href="${escapeHtml(safeUrl(document.engagement.cta.href))}" rel="noopener noreferrer">${escapeHtml(document.engagement.cta.label)}</a>`
    : ""

  // CSS escaping keeps author-supplied Report/Course theme values inside the style
  // element; HTML entities would change CSS tokens without closing this boundary.
  const css = document.kind === "report" ? (baseCss(document) + REPORT_ARTIFACT_CSS + REPORT_CHART_CSS).replace(/</g, "\\3c ")
    : document.kind === "course" ? (baseCss(document) + COURSE_ARTIFACT_CSS).replace(/</g, "\\3c ") : baseCss(document)
  const subtitle = (document.kind === "report" || document.kind === "course") && document.subtitle ? `<p class="artifact-subtitle">${escapeHtml(document.subtitle)}</p>` : ""
  const runtime = document.kind === "course" ? courseRuntimeScript(options.preview === true)
    : document.kind === "report" && options.preview === true ? "" : runtimeScript(options.preview === true)
  return `<!doctype html><html lang="${escapeHtml(document.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(document.seo.title)}</title><meta name="description" content="${escapeHtml(document.seo.description)}"><style>${css}</style></head><body data-kind="${document.kind}" data-public-id="${escapeHtml(options.visualizationId)}"><header class="artifact-header"><p>${escapeHtml(document.brand.companyName)}</p><h1>${escapeHtml(document.title)}</h1>${subtitle}<p>${escapeHtml(document.summary)}</p></header>${body}${cta}${runtime}</body></html>`
}

function baseCss(document: VisualizationDocument) {
  return `:root{color-scheme:${document.theme.mode === "dark" ? "dark" : "light"};--bg:${document.theme.background};--fg:${document.theme.foreground};--accent:${document.theme.accent};--muted:${document.theme.muted};--border:${document.theme.border};font-family:${document.theme.bodyFont}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);line-height:1.55}a{color:inherit}.artifact-header{padding:clamp(2rem,5vw,4rem);border-bottom:1px solid var(--border)}.artifact-header h1{max-width:900px;font-size:clamp(2rem,5vw,4.5rem);line-height:1.05;margin:.25rem 0}.artifact-header p{max-width:760px}.course,.report,.slides{max-width:1120px;margin:auto;padding:2rem}.toc{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--border);padding:.75rem 2rem;z-index:2}.toc ol{display:flex;gap:1rem;list-style:none;overflow:auto;margin:0;padding:0}.module,.lesson,.report>*,.slide{padding:1.5rem 0;border-bottom:1px solid var(--border)}.slides{scroll-snap-type:y mandatory}.slide{min-height:72vh;scroll-snap-align:start}.blocks,.stats,.comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.stats article,.kpi,.callout,.chart,table,.tabs article{border:1px solid var(--border);padding:1rem;background:color-mix(in srgb,var(--bg) 90%,white);border-radius:8px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--border);padding:.5rem;text-align:left}.floating-cta{position:fixed;right:1rem;bottom:1rem;background:var(--accent);color:white;padding:.75rem 1rem;border-radius:8px;text-decoration:none}.feedback[hidden]{display:none}@media(max-width:720px){.course,.report,.slides{padding:1rem}.artifact-header{padding:1.25rem}.floating-cta{position:static;display:block;margin:1rem}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;scroll-behavior:auto!important}}`
}

export async function compileVisualizationArtifact(
  rawDocument: VisualizationDocument,
  options: ArtifactCompileOptions,
): Promise<CompiledArtifact> {
  const document = migrateVisualizationDocument(rawDocument)
  const documentHash = contentHash(document)
  const reportLayout = document.kind === "report" ? reportArtifactLayout(document.report) : null
  const body =
    document.kind === "course"
      ? renderCourse(document)
      : document.kind === "slides"
        ? renderSlides(document)
        : renderReport(document, reportLayout!)
  const html = shell(document, body, options)
  const artifactHash = contentHash(html)
  const manifest: ArtifactManifest = {
    visualizationId: options.visualizationId,
    versionId: options.versionId,
    kind: document.kind,
    schemaVersion: document.schemaVersion,
    documentHash,
    artifactHash,
    createdAt: options.createdAt ?? new Date().toISOString(),
    rendererVersion: document.kind === "report" ? REPORT_RENDERER_VERSION : document.kind === "course" ? COURSE_RENDERER_VERSION : RENDERER_VERSION,
    sourceHashes: document.sourceManifest.map((source) => source.contentHash),
    assetReferences: document.assetIds,
    runtimeFeatures: document.kind === "report"
      ? [reportLayout?.placements ? "responsive-report-grid" : "report-flow-fallback", "inline-svg-charts", "print-flow", ...(options.preview ? ["preview", "no-analytics"] : ["analytics-beacon"]), "no-external-js"]
      : options.preview
        ? ["preview", "in-memory-course-progress", "no-analytics", "no-external-js"]
        : ["analytics-beacon", "local-course-progress", "no-external-js"],
  }

  return {
    html,
    manifest,
    contentHash: artifactHash,
    warnings: reportLayout?.warnings ?? [],
  }
}
