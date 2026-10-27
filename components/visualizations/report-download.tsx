"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { REPORT_DOWNLOAD_TIMEOUT_MS, requestReportDownload } from "@/lib/client/report-download"
import type { ReportVisualizationDocument } from "@/packages/domain/entities"

type DownloadState = {
  document: ReportVisualizationDocument
  status: "idle" | "working" | "ready" | "error"
  href?: string
  filename?: string
  error?: string
}
type DownloadRequest = { document: ReportVisualizationDocument; controller: AbortController; timer: ReturnType<typeof setTimeout> | null }

export function ReportDownload({ document }: { document: ReportVisualizationDocument }) {
  const [state, setState] = useState<DownloadState>({ document, status: "idle" })
  const mounted = useRef(false)
  const latestDocument = useRef(document)
  const request = useRef<DownloadRequest | null>(null)
  const objectURL = useRef<string | null>(null)
  latestDocument.current = document
  const current = state.document === document ? state : { document, status: "idle" as const }

  function revokeFile() {
    if (objectURL.current) URL.revokeObjectURL(objectURL.current)
    objectURL.current = null
  }

  function owns(owner: DownloadRequest) {
    return mounted.current && latestDocument.current === owner.document && request.current === owner
  }

  useEffect(() => {
    mounted.current = true
    setState({ document, status: "idle" })
    return () => {
      mounted.current = false
      const active = request.current
      request.current = null
      if (active) { if (active.timer !== null) clearTimeout(active.timer); active.controller.abort() }
      revokeFile()
    }
  }, [document])

  async function prepare() {
    if (!mounted.current || request.current) return
    revokeFile()
    const owner: DownloadRequest = { document, controller: new AbortController(), timer: null }
    request.current = owner
    setState({ document, status: "working" })
    owner.timer = setTimeout(() => {
      if (!owns(owner)) return
      request.current = null
      owner.controller.abort()
      setState({ document, status: "error", error: "Preparing the Report file timed out. Your draft is still available; try again." })
    }, REPORT_DOWNLOAD_TIMEOUT_MS)
    try {
      const result = await requestReportDownload(document, owner.controller.signal)
      if (!owns(owner)) return
      const href = URL.createObjectURL(new Blob([result.html], { type: "text/html;charset=utf-8" }))
      if (!owns(owner)) { URL.revokeObjectURL(href); return }
      objectURL.current = href
      setState({ document, status: "ready", href, filename: result.filename })
    } catch (cause) {
      if (owns(owner)) setState({ document, status: "error", error: cause instanceof Error ? cause.message : "The Report file could not be prepared. Your draft is still available; try again." })
    } finally {
      if (owner.timer !== null) clearTimeout(owner.timer)
      if (request.current === owner) request.current = null
    }
  }

  return <div className="grid min-w-0 max-w-sm gap-2" aria-label="Report HTML download" aria-busy={current.status === "working"}>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={current.status === "working"} onClick={() => { void prepare() }}>
        {current.status === "working" ? "Preparing Report HTML…" : current.status === "error" ? "Retry Report HTML" : "Download Report HTML"}
      </Button>
      {current.status === "ready" && current.href === objectURL.current ? <a href={current.href} download={current.filename}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Save Report HTML</a> : null}
    </div>
    {current.status === "error" ? <p role="alert" className="max-h-40 overflow-y-auto whitespace-pre-line break-words text-xs leading-5 text-destructive">{current.error}</p>
      : current.status === "ready" ? <p role="status" aria-live="polite" className="text-xs leading-5 text-muted-foreground">Your Report file is ready. Choose Save Report HTML to keep a copy.</p>
      : <p className="text-xs leading-5 text-muted-foreground">Prepare the file, then save an HTML copy of this draft.</p>}
  </div>
}
