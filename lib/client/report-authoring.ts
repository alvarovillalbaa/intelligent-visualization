import type { GenerationBatch } from "@/lib/client/generation-batch"
import type { GeneratedDraft } from "@/lib/client/guest-draft"
import type { ReportBlock, ReportLayoutItem, ReportVisualizationDocument } from "@/packages/domain/entities"
import { reportDocumentSchema } from "@/packages/domain/schemas"
import { REPORT_GRID_COLUMNS, type ReportBreakpoint } from "@/lib/client/report-grid"
import { requirePreparedReportCsvImport, type ReportCsvImportReview } from "@/lib/client/report-csv"

export { REPORT_GRID_COLUMNS, REPORT_GRID_ROW_HEIGHT, REPORT_GRID_GAP, type ReportBreakpoint } from "@/lib/client/report-grid"
export const REPORT_AUTHORING_LIMITS = {
  bytes: 2 * 1024 * 1024, depth: 28, nodes: 100_000, arrayItems: 512,
  topBlocks: 128, blocks: 512, nestedTabs: 4, rows: 256,
  chartRows: 256, chartSeries: 16, tableColumns: 32, tableRows: 256,
} as const

function invalid(message: string): never { throw new Error(message) }

// Bound untrusted values before recursive schema parsing; compare canonical JSON
// afterwards so the non-strict shared schema cannot silently discard edits.
function reportJson(value: unknown): string {
  const parts: string[] = [], ancestors = new Set<object>(), encoder = new TextEncoder()
  let bytes = 0, nodes = 0
  const append = (text: string) => {
    bytes += encoder.encode(text).byteLength
    if (bytes > REPORT_AUTHORING_LIMITS.bytes) invalid("Report edits must be at most 2 MiB of JSON. Shorten the content before applying.")
    parts.push(text)
  }
  const visit = (entry: unknown, depth: number) => {
    if (++nodes > REPORT_AUTHORING_LIMITS.nodes || depth > REPORT_AUTHORING_LIMITS.depth) invalid("This report is too complex to edit. Reduce its nested content.")
    if (entry === null || typeof entry === "boolean") { append(JSON.stringify(entry)); return }
    if (typeof entry === "string") {
      if (entry.length > REPORT_AUTHORING_LIMITS.bytes) invalid("Report edits must be at most 2 MiB of JSON. Shorten the content before applying.")
      append(JSON.stringify(entry)); return
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) invalid("Report numbers must be finite.")
      append(JSON.stringify(entry)); return
    }
    if (!entry || typeof entry !== "object") invalid("Report edits must contain ordinary JSON values, without missing values or functions.")
    if (ancestors.has(entry)) invalid("Report edits cannot contain circular references.")
    ancestors.add(entry)
    if (Array.isArray(entry)) {
      if (entry.length > REPORT_AUTHORING_LIMITS.arrayItems) invalid("A report list can contain at most 512 entries.")
      if (Reflect.ownKeys(entry).length !== entry.length + 1) invalid("Report lists cannot contain missing entries or extra fields.")
      append("[")
      for (let index = 0; index < entry.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, String(index))
        if (!descriptor || !("value" in descriptor)) invalid("Report lists cannot contain missing entries or computed values.")
        if (index) append(",")
        visit(descriptor.value, depth + 1)
      }
      append("]")
    } else {
      const prototype = Object.getPrototypeOf(entry)
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) invalid("Report edits must contain ordinary JSON objects.")
      const keys = Reflect.ownKeys(entry)
      if (keys.some((key) => typeof key !== "string") || keys.length > REPORT_AUTHORING_LIMITS.nodes) invalid("Report edits contain unsupported object fields.")
      append("{")
      for (const [index, key] of (keys as string[]).sort().entries()) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, key)
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid("Report edits cannot contain hidden or computed fields.")
        if (index) append(",")
        append(JSON.stringify(key)); append(":"); visit(descriptor.value, depth + 1)
      }
      append("}")
    }
    ancestors.delete(entry)
  }
  visit(value, 0)
  return parts.join("")
}

function checkedShape(value: unknown): ReportVisualizationDocument {
  const before = reportJson(value), parsed = reportDocumentSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    invalid(`Check ${issue.path.join(".") || "the report"}: ${issue.message}`)
  }
  const document = parsed.data as ReportVisualizationDocument
  if (reportJson(document) !== before) invalid("The report contains unsupported fields. Remove those fields before applying.")
  return document
}

function nonblank(value: string, label: string) {
  if (!value.trim()) invalid(`${label} cannot be blank.`)
}

function overlap(a: ReportLayoutItem, b: ReportLayoutItem) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function validateLayouts(document: ReportVisualizationDocument, allowMissing = false) {
  const ids = new Set(document.report.blocks.map((block) => block.id))
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
    const columns = REPORT_GRID_COLUMNS[breakpoint], items = document.report.layouts[breakpoint], seen = new Set<string>()
    for (const item of items) {
      if (!ids.has(item.blockId)) invalid(`The ${breakpoint} layout refers to a block that no longer exists.`)
      if (seen.has(item.blockId)) invalid(`The ${breakpoint} layout contains the same block more than once.`)
      seen.add(item.blockId)
      for (const [key, value] of Object.entries(item)) {
        if (key === "blockId" || key === "locked") continue
        if (!Number.isSafeInteger(value) || (value as number) < (key === "x" || key === "y" ? 0 : 1)) invalid(`Layout ${key} must be a ${key === "x" || key === "y" ? "nonnegative" : "positive"} whole number.`)
      }
      if (item.x + item.w > columns || item.y + item.h > REPORT_AUTHORING_LIMITS.rows) invalid(`Keep ${breakpoint} blocks inside ${columns} columns and ${REPORT_AUTHORING_LIMITS.rows} rows.`)
      if ((item.minW ?? 1) > item.w || (item.maxW ?? columns) < item.w || (item.minH ?? 1) > item.h || (item.maxH ?? REPORT_AUTHORING_LIMITS.rows) < item.h
        || (item.maxW !== undefined && item.maxW > columns) || (item.minW !== undefined && item.minW > columns)
        || (item.maxH !== undefined && item.maxH > REPORT_AUTHORING_LIMITS.rows) || (item.minH !== undefined && item.minH > REPORT_AUTHORING_LIMITS.rows)) invalid(`The ${breakpoint} block size must respect its minimum and maximum limits.`)
    }
    if (!allowMissing && seen.size !== ids.size) invalid(`Give every report block a position in the ${breakpoint} layout.`)
    for (let index = 0; index < items.length; index++) {
      for (let other = index + 1; other < items.length; other++) {
        if (overlap(items[index], items[other])) invalid(`Blocks overlap in the ${breakpoint} layout. Move or resize them into free space.`)
      }
    }
  }
}

export function validateReportEdit(value: unknown): ReportVisualizationDocument {
  const document = checkedShape(value)
  for (const [label, text] of Object.entries({ Title: document.title, Summary: document.summary, Audience: document.audience,
    Goal: document.goal, "SEO title": document.seo.title, "SEO description": document.seo.description })) nonblank(text, label)
  if (document.report.blocks.length > REPORT_AUTHORING_LIMITS.topBlocks) invalid("A report can contain at most 128 top-level blocks.")
  const ids = new Set<string>()
  const identify = (id: string, label: string) => {
    nonblank(id, `${label} ID`)
    if (ids.has(id)) invalid(`Duplicate ID “${id}”. Give every report block, tab and chart its own ID.`)
    ids.add(id)
  }
  let blocks = 0
  const visit = (block: ReportBlock, depth: number) => {
    identify(block.id, "Block")
    if (++blocks > REPORT_AUTHORING_LIMITS.blocks) invalid("A report can contain at most 512 blocks, including nested tabs.")
    if (depth > REPORT_AUTHORING_LIMITS.nestedTabs) invalid("Reports can nest tabs at most four levels deep.")
    if (block.kind === "tabs") {
      for (const tab of block.tabs) { identify(tab.id, "Tab"); nonblank(tab.label, "Tab label"); tab.blocks.forEach((child) => visit(child, depth + 1)) }
    }
    if (block.kind === "chart") {
      const chart = block.chart
      identify(chart.id, "Chart")
      if (chart.series.length > REPORT_AUTHORING_LIMITS.chartSeries || chart.data.length > REPORT_AUTHORING_LIMITS.chartRows) invalid("Charts support at most 16 series and 256 data rows in this editor.")
      const series = new Set<string>()
      for (const item of chart.series) {
        nonblank(item.key, "Chart series key"); nonblank(item.label, "Chart series label")
        if (series.has(item.key)) invalid("Chart series keys must be unique.")
        series.add(item.key)
        for (const row of chart.data) {
          if (!Object.hasOwn(row, item.key) || (row[item.key] !== null && typeof row[item.key] !== "number")) invalid("Every chart row needs a number or null for each series key.")
        }
      }
      if (chart.xKey !== undefined) {
        nonblank(chart.xKey, "Chart category key")
        if (chart.data.some((row) => !Object.hasOwn(row, chart.xKey!))) invalid("Every chart row needs the selected category key.")
      }
      nonblank(chart.title, "Chart title"); nonblank(chart.accessibleLabel, "Chart accessible label")
    }
    if (block.kind === "data-table") {
      if (!block.columns.length || block.columns.length > REPORT_AUTHORING_LIMITS.tableColumns || block.rows.length > REPORT_AUTHORING_LIMITS.tableRows) invalid("Tables need 1–32 columns and at most 256 rows.")
      if (block.rows.some((row) => row.length !== block.columns.length)) invalid("Each table row must have one cell per column.")
    }
    if (block.kind === "image" && !document.assetIds.includes(block.assetId)) invalid("Choose an image asset already attached to this report.")
    if (block.kind === "cta") {
      const protocol = new URL(block.cta.href).protocol
      if (protocol !== "http:" && protocol !== "https:") invalid("Report action links must use HTTP or HTTPS.")
    }
  }
  document.report.blocks.forEach((block) => visit(block, 0))
  const snapshotIDs = new Set<string>()
  for (const snapshot of document.report.dataSources) {
    nonblank(snapshot.id, "Data snapshot ID")
    if (snapshotIDs.has(snapshot.id)) invalid("Data snapshot IDs must be unique.")
    snapshotIDs.add(snapshot.id)
    if (snapshot.rowCount !== undefined && (!Number.isSafeInteger(snapshot.rowCount) || snapshot.rowCount < 0)) invalid("Snapshot row counts must be nonnegative whole numbers.")
  }
  validateLayouts(document)
  return document
}

function appendPlacement(items: ReportLayoutItem[], breakpoint: ReportBreakpoint, blockId: string, source?: ReportLayoutItem) {
  const y = items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0)
  const next: ReportLayoutItem = source ? { ...source, blockId, x: 0, y, locked: false } : { blockId, x: 0, y, w: REPORT_GRID_COLUMNS[breakpoint], h: 6 }
  items.push(next)
}

export function prepareReportEdit(value: ReportVisualizationDocument): ReportVisualizationDocument {
  const document = checkedShape(value)
  validateLayouts(document, true)
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
    const items = document.report.layouts[breakpoint]
    for (const block of document.report.blocks) {
      if (!items.some((item) => item.blockId === block.id)) appendPlacement(items, breakpoint, block.id)
    }
  }
  return validateReportEdit(document)
}

export function changeReportLayout(value: ReportVisualizationDocument, breakpoint: ReportBreakpoint, blockId: string,
  patch: Partial<Pick<ReportLayoutItem, "x" | "y" | "w" | "h" | "locked">>): ReportVisualizationDocument {
  const document = validateReportEdit(value)
  if (!Object.hasOwn(REPORT_GRID_COLUMNS, breakpoint)) invalid("Choose a supported report breakpoint.")
  const item = document.report.layouts[breakpoint].find((entry) => entry.blockId === blockId)
  if (!item) invalid("The report block is no longer available.")
  const keys = Object.keys(patch)
  if (keys.some((key) => !["x", "y", "w", "h", "locked"].includes(key))) invalid("Only position, size and lock can change through layout controls.")
  if (item.locked && keys.some((key) => key !== "locked")) invalid("Unlock this block before moving or resizing it.")
  Object.assign(item, patch)
  return validateReportEdit(document)
}

export function createReportBlock(kind: ReportBlock["kind"]): ReportBlock {
  const id = crypto.randomUUID()
  switch (kind) {
    case "heading": return { id, kind, level: 2, text: "New heading" }
    case "rich-text": return { id, kind, text: "Explain the evidence and what it means." }
    case "callout": return { id, kind, title: "Key finding", body: "Explain the key finding." }
    case "quote": return { id, kind, quote: "Add the exact quotation.", byline: "Add its source." }
    case "divider": return { id, kind }
    case "kpi": return { id, kind, label: "New metric", value: "—", detail: "Add the metric and its context.", provenance: "Values have not been supplied." }
    case "chart": return { id, kind, chart: { id: crypto.randomUUID(), type: "bar", title: "New chart", description: "Add data and its context.", series: [{ key: "value", label: "Value" }], data: [], xKey: "label", source: "", provenance: "No data supplied.", accessibleLabel: "Chart awaiting data.", illustrative: false } }
    case "data-table": return { id, kind, title: "New table", columns: ["Column"], rows: [], provenance: "No data supplied." }
    case "tabs": return { id, kind, tabs: [{ id: crypto.randomUUID(), label: "First view", blocks: [createReportBlock("rich-text")] }, { id: crypto.randomUUID(), label: "Second view", blocks: [createReportBlock("rich-text")] }] }
    case "image": return { id, kind, assetId: "", alt: "Describe the existing report image.", caption: "" }
    case "list": return { id, kind, items: ["Add a key point."] }
    case "timeline": return { id, kind, items: [{ label: "Next milestone", detail: "Add timing and context." }] }
    case "comparison": return { id, kind, columns: [{ label: "First option", body: "Describe the first option." }, { label: "Second option", body: "Describe the second option." }] }
    case "source-note": return { id, kind, text: "Add a source citation or qualification." }
    case "cta": return { id, kind, cta: { label: "Read more", href: "https://example.com" } }
    default: return invalid("Choose a supported report block type.")
  }
}

export function addReportBlock(value: ReportVisualizationDocument, kind: ReportBlock["kind"]): ReportVisualizationDocument {
  const document = validateReportEdit(value), block = createReportBlock(kind)
  if (block.kind === "image") {
    if (!document.assetIds.length) invalid("Attach an image asset before adding an image block.")
    block.assetId = document.assetIds[0]
  }
  document.report.blocks.push(block)
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) appendPlacement(document.report.layouts[breakpoint], breakpoint, block.id)
  return validateReportEdit(document)
}

export function appendImportedReportTable(value: ReportVisualizationDocument, review: ReportCsvImportReview): {
  document: ReportVisualizationDocument; blockId: string
} {
  const source = requirePreparedReportCsvImport(review), document = validateReportEdit(value)
  const blockId = crypto.randomUUID(), snapshotId = crypto.randomUUID()
  const headerNote = source.firstRowIsHeader ? "The first CSV record supplies the headings."
    : "Positional headings were generated; every CSV record is a data row."
  document.report.dataSources.push({
    id: snapshotId, label: source.label, contentHash: source.contentHash, rowCount: source.rowCount,
    provenance: `User-supplied CSV import. ${headerNote} SHA-256 fingerprints the parsed columns and rows, not the original file bytes. Source accuracy has not been independently verified.`,
  })
  document.report.blocks.push({
    id: blockId, kind: "data-table", title: source.label,
    columns: [...source.columns], rows: source.rows.map((row) => [...row]),
    provenance: `Initially imported from source snapshot ${snapshotId} (${source.label}); parsed-table SHA-256 ${source.contentHash}. Table cells can be edited; the immutable snapshot describes the original import.`,
  })
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
    appendPlacement(document.report.layouts[breakpoint], breakpoint, blockId)
  }
  return { document: validateReportEdit(document), blockId }
}

export function duplicateReportBlock(value: ReportVisualizationDocument, blockId: string): ReportVisualizationDocument {
  const document = validateReportEdit(value), original = document.report.blocks.find((block) => block.id === blockId)
  if (!original) invalid("The report block is no longer available.")
  const copy = structuredClone(original)
  const identify = (block: ReportBlock) => {
    block.id = crypto.randomUUID()
    if (block.kind === "chart") block.chart.id = crypto.randomUUID()
    if (block.kind === "tabs") for (const tab of block.tabs) { tab.id = crypto.randomUUID(); tab.blocks.forEach(identify) }
  }
  identify(copy)
  document.report.blocks.push(copy)
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
    const items = document.report.layouts[breakpoint]
    appendPlacement(items, breakpoint, copy.id, items.find((item) => item.blockId === original.id))
  }
  return validateReportEdit(document)
}

export function removeReportBlock(value: ReportVisualizationDocument, blockId: string): ReportVisualizationDocument {
  const document = validateReportEdit(value)
  if (!document.report.blocks.some((block) => block.id === blockId)) invalid("The report block is no longer available.")
  if (document.report.blocks.length <= 1) invalid("Keep at least one report block.")
  for (const breakpoint of Object.keys(REPORT_GRID_COLUMNS) as ReportBreakpoint[]) {
    if (document.report.layouts[breakpoint].find((item) => item.blockId === blockId)?.locked) invalid("Unlock this block at every breakpoint before removing it.")
    document.report.layouts[breakpoint] = document.report.layouts[breakpoint].filter((item) => item.blockId !== blockId)
  }
  document.report.blocks = document.report.blocks.filter((block) => block.id !== blockId)
  return validateReportEdit(document)
}

function sameDraft(left: GeneratedDraft, right: GeneratedDraft): boolean {
  const pending: Array<[unknown, unknown, number]> = [[left, right, 0]]
  let nodes = 0
  while (pending.length) {
    const [a, b, depth] = pending.pop()!
    if (++nodes > REPORT_AUTHORING_LIMITS.nodes * 2 || depth > REPORT_AUTHORING_LIMITS.depth + 4) return false
    if (a === b) continue
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
    const aKeys = Object.keys(a).sort(), bKeys = Object.keys(b).sort()
    if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false
    for (const key of aKeys) pending.push([(a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1])
  }
  return true
}

export function applyReportDraftEdit(batch: GenerationBatch, resultId: string, expectedDraft: GeneratedDraft, edited: ReportVisualizationDocument): GenerationBatch {
  const matches = batch.results.filter((result) => result.id === resultId), current = matches[0]
  if (matches.length !== 1 || current.kind !== "report" || current.status !== "completed" || !current.draft || current.draft.kind !== "report" || current.draft.document.kind !== "report") invalid("This completed report is no longer available to edit. Reopen the current report.")
  if (!sameDraft(current.draft, expectedDraft)) invalid("This report changed while you were editing. Reopen it before applying your changes.")
  const candidate = validateReportEdit(edited), document = structuredClone(current.draft.document)
  document.title = candidate.title
  if (candidate.subtitle === undefined) delete document.subtitle
  else document.subtitle = candidate.subtitle
  document.summary = candidate.summary; document.audience = candidate.audience; document.goal = candidate.goal; document.seo = candidate.seo
  const originalSources = document.report.dataSources, editedSources = candidate.report.dataSources
  if (editedSources.length < originalSources.length
    || originalSources.some((source, index) => reportJson(source) !== reportJson(editedSources[index]))) {
    invalid("Existing source snapshots cannot be rewritten, reordered or removed. Reopen the report before applying these changes.")
  }
  const appendedSources = editedSources.slice(originalSources.length)
  for (const source of appendedSources) {
    nonblank(source.label, "Data snapshot label")
    nonblank(source.provenance, "Data snapshot provenance")
    if (!/^[a-f0-9]{64}$/.test(source.contentHash)) invalid("New source snapshots need a valid SHA-256 parsed-data fingerprint.")
  }
  document.report = { ...candidate.report, dataSources: [...originalSources, ...appendedSources] }
  const nextDraft = structuredClone(current.draft)
  nextDraft.document = validateReportEdit(document)
  delete nextDraft.artifactHtml
  return { ...batch, results: batch.results.map((result) => result === current ? { ...result, draft: nextDraft } : result) }
}
