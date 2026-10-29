import { validateCourseEdit } from "@/lib/client/course-authoring"
import type { CourseVisualizationDocument } from "@/packages/domain/entities"

export const COURSE_DOWNLOAD_TIMEOUT_MS = 30_000
export const COURSE_DOWNLOAD_RESPONSE_BYTES = 8 * 1024 * 1024

const MESSAGES = {
  invalid_course: "This Course draft could not be validated for download. Review its content and try again; your draft is still available.",
  preparation_failed: "The Course file could not be prepared. Your draft is still available; try again.",
  response_too_large: "This Course file is too large to download here. Reduce its content and try again.",
  response_empty: "The Course file response was empty. Try again.",
  response_unrecognized: "The Course file response was not recognized. Your draft is still available; try again.",
  response_incomplete: "The Course file response was incomplete. Your draft is still available; try again.",
} as const

export class CourseDownloadError extends Error {
  readonly code: keyof typeof MESSAGES
  constructor(code: keyof typeof MESSAGES) {
    const safe = Object.hasOwn(MESSAGES, code) ? code : "preparation_failed"
    super(MESSAGES[safe])
    this.name = "CourseDownloadError"
    this.code = safe
  }
}

export function courseDownloadFilename(title: string): string {
  const name = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 80)
    .replace(/[-_]+$/g, "").toLowerCase()
  return `course-${name || "draft"}.html`
}

function rejectResponse(response: Response, code: keyof typeof MESSAGES): never {
  if (response.body) void response.body.cancel().catch(() => {})
  throw new CourseDownloadError(code)
}

async function boundedResponseText(response: Response, signal: AbortSignal): Promise<string> {
  const length = response.headers.get("content-length")
  if (length !== null) {
    if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) rejectResponse(response, "response_unrecognized")
    if (Number(length) > COURSE_DOWNLOAD_RESPONSE_BYTES) rejectResponse(response, "response_too_large")
  }
  if (!response.body) throw new CourseDownloadError("response_empty")
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true })
  const parts: string[] = []
  let bytes = 0, complete = false
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      signal.throwIfAborted()
      if (next.done) { complete = true; break }
      bytes += next.value.byteLength
      if (bytes > COURSE_DOWNLOAD_RESPONSE_BYTES) throw new CourseDownloadError("response_too_large")
      parts.push(decoder.decode(next.value, { stream: true }))
    }
    parts.push(decoder.decode())
    return parts.join("")
  } finally {
    signal.removeEventListener("abort", abort)
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function requestCourseDownload(document: CourseVisualizationDocument, signal: AbortSignal): Promise<{ html: string; filename: string }> {
  signal.throwIfAborted()
  let snapshot: CourseVisualizationDocument
  try {
    // Validate before cloning unknown data; export only a detached checked copy.
    snapshot = structuredClone(validateCourseEdit(document))
  } catch { throw new CourseDownloadError("invalid_course") }
  signal.throwIfAborted()
  let received: Response | undefined
  try {
    let response: Response
    try {
      response = await fetch("/api/visualizations/artifact", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: snapshot }), signal,
      })
    } catch {
      signal.throwIfAborted()
      throw new CourseDownloadError("preparation_failed")
    }
    received = response
    signal.throwIfAborted()
    if (!response.ok) rejectResponse(response, "preparation_failed")
    if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") rejectResponse(response, "response_unrecognized")
    const raw = await boundedResponseText(response, signal)
    signal.throwIfAborted()
    let payload: unknown
    try { payload = JSON.parse(raw) }
    catch { throw new CourseDownloadError("response_unrecognized") }
    const html = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { artifactHtml?: unknown }).artifactHtml : null
    if (typeof html !== "string" || !/^\s*<!doctype html>/i.test(html) || !/<html(?:\s|>)/i.test(html)
      || !/<head(?:\s|>)/i.test(html) || !/<\/head>/i.test(html) || !/<body(?:\s|>)/i.test(html) || !/<\/body>\s*<\/html>\s*$/i.test(html)) {
      throw new CourseDownloadError("response_incomplete")
    }
    return { html, filename: courseDownloadFilename(snapshot.title) }
  } catch (cause) {
    signal.throwIfAborted()
    if (cause instanceof CourseDownloadError) throw cause
    throw new CourseDownloadError("response_unrecognized")
  } finally {
    if (signal.aborted && received?.body && !received.body.locked) void received.body.cancel().catch(() => {})
  }
}
