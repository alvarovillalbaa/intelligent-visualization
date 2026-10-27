import { prepareReportEdit } from "@/lib/client/report-authoring"
import type { ReportVisualizationDocument } from "@/packages/domain/entities"

export const REPORT_DOWNLOAD_TIMEOUT_MS = 30_000
export const REPORT_DOWNLOAD_RESPONSE_BYTES = 8 * 1024 * 1024

export function reportDownloadFilename(title: string): string {
  const name = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 80)
    .replace(/[-_]+$/g, "").toLowerCase()
  return `report-${name || "draft"}.html`
}

function rejectResponse(response: Response, message: string): never {
  if (response.body) void response.body.cancel().catch(() => {})
  throw new Error(message)
}

async function boundedResponseText(response: Response, signal: AbortSignal): Promise<string> {
  const length = response.headers.get("content-length")
  if (length && Number(length) > REPORT_DOWNLOAD_RESPONSE_BYTES) rejectResponse(response, "This Report file is too large to download here. Reduce its content and try again.")
  if (!response.body) throw new Error("The Report file response was empty. Try again.")
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true })
  const text: string[] = []
  let bytes = 0, complete = false
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      signal.throwIfAborted()
      if (next.done) { complete = true; break }
      bytes += next.value.byteLength
      if (bytes > REPORT_DOWNLOAD_RESPONSE_BYTES) throw new Error("This Report file is too large to download here. Reduce its content and try again.")
      text.push(decoder.decode(next.value, { stream: true }))
    }
    text.push(decoder.decode())
    return text.join("")
  } finally {
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function requestReportDownload(document: ReportVisualizationDocument, signal: AbortSignal): Promise<{ html: string; filename: string }> {
  // Preparing fills empty generated layouts on a validated clone. The displayed
  // draft and its stored copy are never rewritten by an export.
  const snapshot = prepareReportEdit(document)
  signal.throwIfAborted()
  const response = await fetch("/api/visualizations/artifact", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ document: snapshot }), signal,
  })
  signal.throwIfAborted()
  if (!response.ok) rejectResponse(response, "The Report file could not be prepared. Your draft is still available; try again.")
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) rejectResponse(response, "The Report file response was not recognized. Try again.")
  const raw = await boundedResponseText(response, signal)
  signal.throwIfAborted()
  let payload: unknown
  try { payload = JSON.parse(raw) }
  catch { throw new Error("The Report file response was not recognized. Try again.") }
  const html = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { artifactHtml?: unknown }).artifactHtml : null
  if (typeof html !== "string" || !/^\s*<!doctype html>/i.test(html) || !/<html(?:\s|>)/i.test(html)
    || !/<head(?:\s|>)/i.test(html) || !/<\/head>/i.test(html) || !/<body(?:\s|>)/i.test(html) || !/<\/body>\s*<\/html>\s*$/i.test(html)) {
    throw new Error("The Report file response was incomplete. Your draft is still available; try again.")
  }
  return { html, filename: reportDownloadFilename(snapshot.title) }
}
