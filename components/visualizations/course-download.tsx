"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { COURSE_DOWNLOAD_TIMEOUT_MS, CourseDownloadError, requestCourseDownload } from "@/lib/client/course-download"
import type { CourseVisualizationDocument } from "@/packages/domain/entities"

type DownloadRequest = {
  document: CourseVisualizationDocument
  controller: AbortController
  timer: ReturnType<typeof setTimeout> | null
  generation: number
  deadline: number
  phase: "pending" | "ready" | "failed" | "expired"
}
type DownloadState = {
  document: CourseVisualizationDocument
  owner: DownloadRequest | null
  status: "idle" | "working" | "ready" | "error"
  href?: string
  filename?: string
  error?: string
}

export function CourseDownload({ document }: { document: CourseVisualizationDocument }) {
  const [state, setState] = useState<DownloadState>({ document, owner: null, status: "idle" })
  const committedDocument = useRef<CourseVisualizationDocument | null>(null)
  const generation = useRef(0)
  const request = useRef<DownloadRequest | null>(null)
  const file = useRef<{ owner: DownloadRequest; href: string } | null>(null)
  const current: DownloadState = state.document === document ? state : { document, owner: null, status: "idle" }
  // Discard an obsolete presentation before commit, including an A → B → A switch.
  if (state.document !== document) setState({ document, owner: null, status: "idle" })

  function revokeFile() {
    const previous = file.current
    file.current = null
    if (previous) URL.revokeObjectURL(previous.href)
  }

  function owns(owner: DownloadRequest) {
    return committedDocument.current === owner.document && generation.current === owner.generation
  }

  useLayoutEffect(() => {
    committedDocument.current = document
    generation.current++
    return () => {
      committedDocument.current = null
      generation.current++
      const active = request.current
      request.current = null
      if (active) {
        active.phase = "expired"
        if (active.timer !== null) clearTimeout(active.timer)
        active.controller.abort()
      }
      revokeFile()
    }
  }, [document])

  function expire(owner: DownloadRequest) {
    if (!owns(owner) || owner.phase !== "pending") return
    owner.phase = "expired"
    if (owner.timer !== null) { clearTimeout(owner.timer); owner.timer = null }
    if (request.current === owner) request.current = null
    owner.controller.abort()
    setState((previous) => owns(owner) && previous.owner === owner ? { document: owner.document, owner, status: "error",
      error: "Preparing the Course file timed out. Your draft is still available; try again." } : previous)
  }

  function pending(owner: DownloadRequest) {
    if (!owns(owner) || owner.phase !== "pending") return false
    if (performance.now() >= owner.deadline) { expire(owner); return false }
    return true
  }

  async function prepare() {
    if (committedDocument.current !== document || request.current) return
    revokeFile()
    const owner: DownloadRequest = { document, controller: new AbortController(), timer: null,
      generation: ++generation.current, deadline: performance.now() + COURSE_DOWNLOAD_TIMEOUT_MS, phase: "pending" }
    request.current = owner
    setState({ document, owner, status: "working" })
    owner.timer = setTimeout(() => expire(owner), COURSE_DOWNLOAD_TIMEOUT_MS)
    try {
      const result = await requestCourseDownload(document, owner.controller.signal)
      if (!pending(owner)) return
      const href = URL.createObjectURL(new Blob([result.html], { type: "text/html;charset=utf-8" }))
      if (!pending(owner)) { URL.revokeObjectURL(href); return }
      owner.phase = "ready"
      file.current = { owner, href }
      setState((previous) => owns(owner) && owner.phase === "ready" && previous.owner === owner
        ? { document, owner, status: "ready", href, filename: result.filename } : previous)
    } catch (cause) {
      if (!pending(owner)) return
      owner.phase = "failed"
      const error = cause instanceof CourseDownloadError ? cause.message
        : "The Course file could not be prepared. Your draft is still available; try again."
      setState((previous) => owns(owner) && previous.owner === owner ? { document, owner, status: "error", error } : previous)
    } finally {
      if (owner.timer !== null) { clearTimeout(owner.timer); owner.timer = null }
      if (request.current === owner) request.current = null
    }
  }

  return <div className="grid min-w-0 max-w-sm gap-2" aria-label="Course HTML download" aria-busy={current.status === "working"}>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-h-11" disabled={current.status === "working"} onClick={() => { void prepare() }}>
        {current.status === "working" ? "Preparing Course HTML…" : current.status === "error" ? "Retry Course HTML" : "Download Course HTML"}
      </Button>
      {current.status === "ready" && current.href ? <a href={current.href} download={current.filename}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">Save Course HTML</a> : null}
    </div>
    {current.status === "error" ? <p role="alert" className="max-h-40 overflow-y-auto whitespace-pre-line break-words text-xs leading-5 text-destructive">{current.error}</p>
      : current.status === "ready" ? <p role="status" aria-live="polite" className="text-xs leading-5 text-muted-foreground">Your Course file is ready. Choose Save Course HTML to keep a copy.</p>
      : <p className="text-xs leading-5 text-muted-foreground">Prepare the file, then save an HTML copy of this draft.</p>}
  </div>
}
