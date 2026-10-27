"use client"

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowRightIcon,
  CheckIcon,
  FileTextIcon,
  GlobeIcon,
  Loader2Icon,
  PaperclipIcon,
  PencilLineIcon,
  XIcon,
} from "lucide-react"

import { createDeckFromGeneratedSourceAction } from "@/app/actions/decks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { visualizationOptions } from "@/components/visualizations/options"
import { StylePanel } from "@/components/visualizations/style-panel"
import { VisualizationPreview } from "@/components/visualizations/preview"
import { GenerationResults, isExampleDraft } from "@/components/visualizations/generation-results"
import { CourseEditor } from "@/components/visualizations/course-editor"
import { applyCourseDraftEdit } from "@/lib/client/course-authoring"
import {
  clearGuestDraft,
  loadGuestDraft,
  storeGuestDraft,
  type GeneratedDraft,
} from "@/lib/client/guest-draft"
import { readFiles, type ImportedFile } from "@/lib/client/import-files"
import { restoreSourceText, serializeSourceText } from "@/lib/client/composer-source-input"
import {
  createGenerationBatch,
  restoreGeneratedDraft,
  restoreGenerationBatch,
  updateGenerationResult,
  type GenerationBatch,
  type GenerationResult,
} from "@/lib/client/generation-batch"
import { extractUrls, urlDomain } from "@/lib/detect-urls"
import { remixTheme, themeLibrary } from "@/lib/deck-runtime"
import type { BrandKit, GenerationInput, ThemeTokens } from "@/lib/types"
import type { CourseVisualizationDocument, VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"
import { cn } from "@/lib/utils"

const DEFAULT_PROMPT = "Create a polished visual document from this source."
const EXTRACTION_TIMEOUT_MS = 15_000
const GENERATION_TIMEOUT_MS = 120_000
const SAVE_TIMEOUT_MS = 30_000

type ComposerProps = { introduction?: ReactNode } & (
  | { mode: "guest" }
  | { mode: "workspace"; workspaceId: string; workspaceSlug: string }
)

type StyleDecision = "accepted" | "shuffled" | "skipped" | null

type CourseEditContext = {
  id: string
  batchId: string
  resultId: string
  expectedDraft: GeneratedDraft
  document: CourseVisualizationDocument
}

type StyleState =
  | { status: "idle" }
  | { status: "loading"; url: string }
  | { status: "unavailable"; url: string; markdown?: string }
  | {
      status: "ready"
      url: string
      markdown?: string
      brandKit: BrandKit
      extracted: ThemeTokens
      candidate: ThemeTokens
      decision: StyleDecision
      shuffleCount: number
    }

function nextShuffledTheme(brandKit: BrandKit, sourceUrl: string, count: number): ThemeTokens {
  const base = themeLibrary[count % themeLibrary.length]
  const palette = Object.values(brandKit.colors)
  const accent = palette.length ? palette[count % palette.length] : undefined

  return remixTheme(
    base,
    accent
      ? {
          companyName: urlDomain(sourceUrl),
          sourceUrl,
          tagline: "",
          voice: "",
          descriptors: [],
          palette: [accent],
          logos: brandKit.logos,
        }
      : undefined,
  )
}

function documentCount(document: VisualizationDocument) {
  if (document.kind === "slides") {
    return `${document.slides.items.length} slides`
  }
  if (document.kind === "course") {
    const lessons = document.course.modules.reduce((sum, module) => sum + module.lessons.length, 0)
    return `${lessons} lessons`
  }
  return `${document.report.blocks.length} blocks`
}

export function Composer(props: ComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)
  const textInputId = useId()
  const hydratedRef = useRef(props.mode !== "guest")
  const mountedRef = useRef(true)
  const generationBusyRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)
  const importEpochRef = useRef(0)
  const pendingImportsRef = useRef(0)
  const batchRef = useRef<GenerationBatch | null>(null)
  const savingRef = useRef(new Set<string>())
  const courseEditorRef = useRef<CourseEditContext | null>(null)

  const [step, setStep] = useState<"source" | "configure">("source")
  const [textEntries, setTextEntries] = useState<string[]>([])
  const [pendingText, setPendingText] = useState("")
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [dismissedUrls, setDismissedUrls] = useState<string[]>([])
  const [selectedKinds, setSelectedKinds] = useState<VisualizationKind[]>(["slides"])
  const [style, setStyle] = useState<StyleState>({ status: "idle" })
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [draft, setDraft] = useState<GeneratedDraft | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [batch, setBatch] = useState<GenerationBatch | null>(null)
  const [previewResultId, setPreviewResultId] = useState<string | null>(null)
  const [courseEditing, setCourseEditing] = useState<CourseEditContext | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [recoveryRequired, setRecoveryRequired] = useState(false)
  const rawText = useMemo(() => serializeSourceText({ entries: textEntries, pending: pendingText }), [textEntries, pendingText])

  const detectedUrl = useMemo(() => {
    return extractUrls(rawText).find((url) => !dismissedUrls.includes(url)) ?? null
  }, [dismissedUrls, rawText])

  const hasInput = Boolean(rawText.trim() || files.length)
  const compatibilityDraft = batch ? batch.results.find((result) => result.draft)?.draft ?? null : draft

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      importEpochRef.current++
      pendingImportsRef.current = 0
      requestRef.current?.abort()
      courseEditorRef.current = null
    }
  }, [])

  useEffect(() => {
    if (props.mode !== "guest") {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      const stored = loadGuestDraft()
      hydratedRef.current = true
      if (!stored) {
        return
      }

      setRecoveryRequired(stored.recoveryRequired === true)
      const restored = restoreSourceText(stored.input)
      const multilinePending = /[\r\n]/.test(restored.pending)
      setTextEntries(multilinePending ? [...restored.entries, restored.pending] : restored.entries)
      setPendingText(multilinePending ? "" : restored.pending)
      setFiles(stored.input.files)
      const storedKinds = stored.selectedKinds ?? [stored.selectedKind]
      setSelectedKinds(visualizationOptions.map((option) => option.kind).filter((kind) => storedKinds.includes(kind)))
      setDraft(stored.draft)
      const restoredBatch = restoreGenerationBatch(stored.batch)
      batchRef.current = restoredBatch
      setBatch(restoredBatch)
    })

    return () => {
      cancelled = true
    }
  }, [props.mode])

  useEffect(() => {
    if (props.mode !== "guest" || !hydratedRef.current || recoveryRequired) {
      return
    }

    const result = storeGuestDraft({
      input: { rawText, files, textEntries, pendingText },
      selectedKind: selectedKinds[0] ?? "slides",
      selectedKinds,
      draft: compatibilityDraft,
      batch: batch ?? undefined,
    })
    const notice = !result.stored
      ? "Browser storage is unavailable or full. Keep this tab open; the current sources and drafts have not been saved for reload."
      : result.compacted ? "A smaller copy was saved in this browser. Keep this tab open to retain all source content and entry grouping." : null
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setStorageNotice(notice) })
    return () => { cancelled = true }
  }, [compatibilityDraft, files, props.mode, rawText, selectedKinds, textEntries, pendingText, batch, recoveryRequired])

  function replaceBatch(next: GenerationBatch | null) {
    batchRef.current = next
    setBatch(next)
  }

  function replaceCourseEditor(next: CourseEditContext | null) {
    courseEditorRef.current = next
    setCourseEditing(next)
  }

  function editCourse(resultId: string) {
    const current = batchRef.current
    const result = current?.results.find((candidate) => candidate.id === resultId)
    if (!current || result?.status !== "completed" || result.kind !== "course" || !result.draft || result.draft.document.kind !== "course" || isExampleDraft(result.draft)) return
    replaceCourseEditor({
      id: crypto.randomUUID(), batchId: current.id, resultId,
      expectedDraft: structuredClone(result.draft), document: structuredClone(result.draft.document),
    })
    setPreviewOpen(false)
    setPreviewResultId(null)
  }

  function applyCourseChanges(context: CourseEditContext, document: CourseVisualizationDocument): string | null {
    const current = batchRef.current
    if (!mountedRef.current || courseEditorRef.current?.id !== context.id || !current || current.id !== context.batchId) {
      return "This draft changed while you were editing. Keep a copy of your changes, then reopen its editor."
    }
    try {
      replaceBatch(applyCourseDraftEdit(current, context.resultId, context.expectedDraft, document))
      replaceCourseEditor(null)
      setPreviewResultId(context.resultId)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : "The Course changes could not be applied. Your edits remain here."
    }
  }

  function closeCourseEditor(context: CourseEditContext) {
    if (courseEditorRef.current?.id === context.id) replaceCourseEditor(null)
  }

  function patchResult(batchId: string, resultId: string, patch: Partial<Omit<GenerationResult, "id" | "kind">>) {
    const current = batchRef.current
    if (!mountedRef.current || !current || current.id !== batchId) return
    replaceBatch(updateGenerationResult(current, resultId, patch))
  }

  function toggleKind(kind: VisualizationKind) {
    if (generationBusyRef.current) return
    setSelectedKinds((current) => visualizationOptions.map((option) => option.kind)
      .filter((candidate) => candidate === kind ? !current.includes(kind) : current.includes(candidate)))
  }

  function commitText(text: string) {
    if (text === "") return
    setTextEntries((current) => [...current, text])
    setPendingText("")
  }

  function addPendingText() {
    if (!pendingText.trim()) return
    commitText(pendingText)
    textInputRef.current?.focus({ preventScroll: true })
  }

  async function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList || !Array.from(fileList).length) {
      return
    }

    const epoch = importEpochRef.current
    pendingImportsRef.current++
    setImporting(true)
    try {
      const imported = await readFiles(fileList)
      if (!mountedRef.current || importEpochRef.current !== epoch) return
      setFiles((current) => {
        const existing = new Set(current.map((file) => file.name))
        return [...current, ...imported.filter((file) => !existing.has(file.name))]
      })
    } finally {
      if (mountedRef.current && importEpochRef.current === epoch) {
        pendingImportsRef.current--
        if (pendingImportsRef.current === 0) setImporting(false)
      }
    }
  }

  function removeFile(name: string) {
    setFiles((current) => current.filter((file) => file.name !== name))
  }

  function startExtraction(url: string) {
    setStyle({ status: "loading", url })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

    fetch("/api/brand/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          available?: boolean
          brandKit?: BrandKit
          markdown?: string
          proposedTheme?: ThemeTokens
        }

        setStyle((current) => {
          if (current.status !== "loading" || current.url !== url) {
            return current
          }
          if (payload.available && payload.brandKit && payload.proposedTheme) {
            return {
              status: "ready",
              url,
              markdown: payload.markdown,
              brandKit: payload.brandKit,
              extracted: payload.proposedTheme,
              candidate: payload.proposedTheme,
              decision: null,
              shuffleCount: 0,
            }
          }
          return { status: "unavailable", url, markdown: payload.markdown }
        })
      })
      .catch(() => {
        setStyle((current) =>
          current.status === "loading" && current.url === url
            ? { status: "unavailable", url }
            : current,
        )
      })
      .finally(() => clearTimeout(timer))
  }

  function handleContinue() {
    // Moving pending text into an entry leaves the canonical rawText unchanged.
    commitText(pendingText)
    setStep("configure")
    setError(null)

    if (detectedUrl && (style.status === "idle" || ("url" in style && style.url !== detectedUrl))) {
      startExtraction(detectedUrl)
    }
    if (!detectedUrl && style.status !== "idle") {
      setStyle({ status: "idle" })
    }
  }

  function useCandidateStyle() {
    setStyle((current) =>
      current.status === "ready" ? { ...current, decision: "accepted" } : current,
    )
  }

  function shuffleStyle() {
    setStyle((current) => {
      if (current.status !== "ready") {
        return current
      }
      return {
        ...current,
        candidate: nextShuffledTheme(current.brandKit, current.url, current.shuffleCount),
        decision: "shuffled",
        shuffleCount: current.shuffleCount + 1,
      }
    })
  }

  function skipStyle() {
    setStyle((current) =>
      current.status === "ready" ? { ...current, decision: "skipped" } : current,
    )
  }

  function generationInputSnapshot(): GenerationInput {
    let brandContext: GenerationInput["brandContext"]
    let themeOverride: ThemeTokens | undefined
    let themeMode: GenerationInput["themeMode"] = "brand"

    if (style.status === "ready") {
      if (style.decision === "accepted" || style.decision === "shuffled") {
        brandContext = { brandKit: style.brandKit, markdown: style.markdown }
        themeOverride = style.candidate
        themeMode = style.candidate === style.extracted ? "brand" : "remix"
      } else if (style.markdown) {
        brandContext = { markdown: style.markdown }
      }
    } else if (style.status === "unavailable" && style.markdown) {
      brandContext = { markdown: style.markdown }
    }

    return {
      inputKind: detectedUrl ? "url" : files.length ? "files" : "paste",
      rawText,
      sourceUrl: detectedUrl ?? undefined,
      prompt: DEFAULT_PROMPT,
      files: files.map(({ name, content, type }) => ({ name, content, type })),
      themeMode,
      brandContext,
      themeOverride,
    }
  }

  async function saveWorkspaceSlides(batchId: string, resultId: string, input: GenerationInput, generated: GeneratedDraft) {
    if (props.mode !== "workspace" || savingRef.current.has(resultId)) return
    const current = batchRef.current?.results.find((result) => result.id === resultId)
    if (!current || current.savedDeckId || current.saveStatus === "saved" || current.saveStatus === "uncertain") return
    if (!generated.deckSource) {
      patchResult(batchId, resultId, { saveStatus: "failed", error: "The Slides draft is available, but its editable source could not be saved." })
      return
    }
    savingRef.current.add(resultId)
    patchResult(batchId, resultId, { saveStatus: "saving" })
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = createDeckFromGeneratedSourceAction({ workspaceId: props.workspaceId, generationInput: input, source: generated.deckSource })
    let acknowledged = false
    const recordSaved = (ack: { deckId: string }) => {
      if (typeof ack?.deckId !== "string" || !ack.deckId.trim()) return false
      if (acknowledged) return true
      acknowledged = true
      patchResult(batchId, resultId, { saveStatus: "saved", savedDeckId: ack.deckId, error: null })
      return true
    }
    // A late acknowledgement can still supply the known ID. Never repeat an unacknowledged create.
    void save.then(recordSaved).catch(() => {})
    try {
      const ack = await Promise.race([save, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Save acknowledgement timed out")), SAVE_TIMEOUT_MS) })])
      if (!recordSaved(ack)) patchResult(batchId, resultId, { saveStatus: "uncertain", error: "The workspace did not confirm a saved Slides ID. Your draft remains available here." })
    } catch {
      patchResult(batchId, resultId, { saveStatus: "uncertain", error: "The save response could not be confirmed. Check the workspace before creating another copy." })
    } finally {
      clearTimeout(timer)
      savingRef.current.delete(resultId)
    }
  }

  async function runGeneration(batchId: string, resultIds: string[]) {
    try {
      for (const resultId of resultIds) {
        const current = batchRef.current
        const result = current?.results.find((item) => item.id === resultId)
        if (!mountedRef.current || !current || current.id !== batchId || !result || !["queued", "failed", "interrupted"].includes(result.status)) continue
        patchResult(batchId, resultId, { status: "running", error: null })
        const controller = new AbortController()
        requestRef.current = controller
        let timedOut = false
        const timer = setTimeout(() => { timedOut = true; controller.abort() }, GENERATION_TIMEOUT_MS)
        let message = "The generation service could not be reached. Retry this format when ready."
        try {
          const response = await fetch("/api/visualizations/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: result.kind, generationInput: current.input }),
            signal: controller.signal,
          })
          const payload = await response.json().catch(() => null)
          if (!response.ok) {
            message = typeof payload?.error === "string" ? payload.error.slice(0, 500) : "Generation failed for this format. Retry it when ready."
            throw new Error(message)
          }
          const generated = restoreGeneratedDraft(payload)
          if (!generated || generated.kind !== result.kind || !generated.provider.trim() || !generated.modelName.trim() || isExampleDraft(generated)) {
            message = "The service did not return an AI-generated draft for this format. No example was substituted."
            throw new Error(message)
          }
          if (!mountedRef.current || batchRef.current?.id !== batchId) return
          clearTimeout(timer)
          if (requestRef.current === controller) requestRef.current = null
          patchResult(batchId, resultId, { status: "completed", draft: generated, error: null })
          if (props.mode === "workspace" && result.kind === "slides") await saveWorkspaceSlides(batchId, resultId, current.input, generated)
        } catch {
          patchResult(batchId, resultId, { status: controller.signal.aborted ? "interrupted" : "failed", error: timedOut ? "The generation response timed out. Retry this format when ready." : message })
        } finally {
          clearTimeout(timer)
          if (requestRef.current === controller) requestRef.current = null
        }
      }
    } finally {
      generationBusyRef.current = false
      if (mountedRef.current) setGenerating(false)
    }
  }

  function handleCreate() {
    if (generationBusyRef.current || createDisabled) return
    let next: GenerationBatch
    try {
      next = createGenerationBatch(selectedKinds, generationInputSnapshot(), crypto.randomUUID(), Date.now())
    } catch {
      setError("The draft request could not be prepared. Your sources are still here; try creating again.")
      return
    }
    generationBusyRef.current = true
    setRecoveryRequired(false)
    replaceBatch(next)
    replaceCourseEditor(null)
    setDraft(null)
    setPreviewOpen(false)
    setPreviewResultId(null)
    setError(null)
    setGenerating(true)
    void runGeneration(next.id, next.results.map((result) => result.id))
  }

  function retryResult(id: string) {
    if (generationBusyRef.current) return
    const current = batchRef.current
    const result = current?.results.find((item) => item.id === id)
    if (!current || !result || (result.status !== "failed" && result.status !== "interrupted")) return
    generationBusyRef.current = true
    setGenerating(true)
    void runGeneration(current.id, [id])
  }

  function startOver() {
    if (generationBusyRef.current) return
    importEpochRef.current++
    pendingImportsRef.current = 0
    setImporting(false)
    setStep("source")
    setTextEntries([])
    setPendingText("")
    setFiles([])
    setDismissedUrls([])
    setSelectedKinds(["slides"])
    setStyle({ status: "idle" })
    setDraft(null)
    setPreviewOpen(false)
    setPreviewResultId(null)
    replaceBatch(null)
    replaceCourseEditor(null)
    setRecoveryRequired(false)
    setStorageNotice(null)
    setError(null)
    if (props.mode === "guest") {
      clearGuestDraft()
    }
  }

  const extractionPending = style.status === "loading"
  const awaitingStyleDecision = style.status === "ready" && style.decision === null
  const createDisabled = generating || extractionPending || awaitingStyleDecision || !hasInput || selectedKinds.length === 0

  const sourceSummary = [
    rawText.trim() ? `${rawText.trim().length.toLocaleString()} characters` : null,
    detectedUrl ? urlDomain(detectedUrl) : null,
    files.length ? `${files.length} ${files.length === 1 ? "file" : "files"}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const previewResult = batch?.results.find((result) => result.id === previewResultId)
  const previewDraft = previewResult?.draft ?? (previewOpen ? draft : null)
  const retentionNote = previewResult?.savedDeckId ? "Saved to this workspace." : props.mode === "workspace"
    ? "This draft remains in this tab until workspace saving is confirmed."
    : "This draft is held in this browser when storage is available; account creation does not save it automatically."
  const previewNote = `${retentionNote}${storageNotice ? ` ${storageNotice}` : ""}`

  return (
    <div className="grid gap-4">
      {step === "source" ? props.introduction : null}
      {step === "source" ? (
        <section
          className={cn(
            "grid gap-0 overflow-hidden rounded-xl bg-white shadow-sm transition",
            dragActive ? "ring-2 ring-[#111513]" : null,
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDragActive(false)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            void handleFiles(event.dataTransfer.files)
          }}
        >
          <div className="grid gap-2 px-5 pb-4 pt-5">
            <label htmlFor={textInputId} className="text-sm font-medium">Text or link</label>
            <div className="flex items-center gap-2">
              <Input
                ref={textInputRef}
                id={textInputId}
                value={pendingText}
                onChange={(event) => setPendingText(event.target.value)}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
                  event.preventDefault()
                  if (!event.repeat) addPendingText()
                }}
                onPaste={(event) => {
                  if (event.clipboardData.files.length) {
                    event.preventDefault()
                    void handleFiles(event.clipboardData.files)
                    return
                  }
                  const pasted = event.clipboardData.getData("text/plain")
                  if (/[\r\n]/.test(pasted)) {
                    event.preventDefault()
                    const start = event.currentTarget.selectionStart ?? pendingText.length
                    const end = event.currentTarget.selectionEnd ?? start
                    commitText(pendingText.slice(0, start) + pasted + pendingText.slice(end))
                  }
                }}
                placeholder="Add text or a link…"
                aria-describedby={`${textInputId}-help`}
                className="min-h-11 rounded-lg bg-transparent text-base"
              />
              <Button type="button" onClick={addPendingText} disabled={!pendingText.trim()} className="min-h-11">Add</Button>
            </div>
            <p id={`${textInputId}-help`} className="text-xs leading-relaxed text-muted-foreground">
              Press Enter or Add to keep each source below. Multiline pastes are kept together with their line breaks. Continue includes any text still in the input.
            </p>
          </div>

          {textEntries.length > 0 ? (
            <ol aria-label="Text sources" className="grid min-w-0 gap-3 px-5 pb-4">
              {textEntries.map((text, index) => (
                <li key={index} className="flex min-w-0 items-start gap-3 rounded-lg border border-black/10 bg-[#fbfaf6] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Text source {index + 1}</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" aria-label={`Remove text source ${index + 1}`}
                    onClick={() => setTextEntries((current) => current.filter((_, entryIndex) => entryIndex !== index))}>
                    <XIcon aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ol>
          ) : null}

          {detectedUrl || files.length ? (
            <div className="flex flex-wrap gap-2 px-5 pb-1">
              {detectedUrl ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f2efe7] px-3 py-1 text-xs font-medium">
                  <GlobeIcon className="size-3" />
                  {urlDomain(detectedUrl)}
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={() => setDismissedUrls((current) => [...current, detectedUrl])}
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">Ignore {detectedUrl}</span>
                  </button>
                </span>
              ) : null}

              {files.map((file) => (
                <span
                  key={file.name}
                  className="inline-flex items-center gap-2 rounded-full bg-[#f2efe7] px-3 py-1 text-xs font-medium"
                >
                  <FileTextIcon className="size-3" />
                  {file.name}
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={() => removeFile(file.name)}
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">Remove {file.name}</span>
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : <PaperclipIcon data-icon="inline-start" />}
              Attach files
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              multiple
              onChange={(event) => {
                void handleFiles(event.target.files)
                event.target.value = ""
              }}
            />

            {hasInput ? (
              <Button type="button" size="sm" className="min-h-11" onClick={handleContinue} disabled={importing}>
                Continue
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <button
            type="button"
            disabled={generating}
            onClick={() => setStep("source")}
            className="flex items-center justify-between gap-3 rounded-xl bg-white px-5 py-3.5 text-left shadow-sm transition hover:bg-[#fbfaf6]"
          >
            <span className="truncate text-sm text-muted-foreground">{sourceSummary || "No source yet"}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium">
              <PencilLineIcon className="size-3.5" />
              Edit
            </span>
          </button>

          <section role="group" aria-label="Draft formats" className="grid gap-3 sm:grid-cols-3">
            {visualizationOptions.map((option) => {
              const Icon = option.icon
              const active = selectedKinds.includes(option.kind)
              return (
                <button
                  key={option.kind}
                  type="button"
                  aria-pressed={active}
                  disabled={generating}
                  className={cn(
                    "grid min-h-11 gap-3 rounded-xl bg-white p-5 text-left shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-[#111513] focus-visible:ring-offset-2 disabled:opacity-60",
                    active ? "ring-2 ring-[#111513]" : "hover:bg-[#fbfaf6]",
                  )}
                  onClick={() => toggleKind(option.kind)}
                >
                  <span className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-md bg-[#111513] text-white">
                      <Icon className="size-4.5" />
                    </span>
                    {active ? <CheckIcon className="size-4" /> : null}
                  </span>
                  <span>
                    <span className="block font-semibold">{option.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.detail}</span>
                  </span>
                </button>
              )
            })}
          </section>
          <p className="text-sm text-muted-foreground">Choose one or more formats. Each selected format creates its own draft from the same source.</p>

          {style.status === "loading" || (style.status === "ready" && style.decision !== "skipped") ? (
            <StylePanel
              domain={"url" in style ? urlDomain(style.url) : ""}
              loading={style.status === "loading"}
              candidate={style.status === "ready" ? style.candidate : null}
              logo={style.status === "ready" ? style.brandKit.logos[0] : undefined}
              decision={style.status === "ready" && style.decision !== "skipped" ? style.decision : null}
              onUse={useCandidateStyle}
              onShuffle={shuffleStyle}
              onSkip={skipStyle}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="button" size="lg" className="min-h-11" disabled={createDisabled} onClick={handleCreate}>
              {generating || extractionPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {generating ? "Generating" : extractionPending ? "Reading style…" : selectedKinds.length > 1 ? "Create drafts" : "Create draft"}
            </Button>
            {awaitingStyleDecision ? (
              <p className="text-sm text-muted-foreground">Choose a style to continue.</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {selectedKinds.length === 0 ? <p role="status" className="text-sm text-muted-foreground">Select at least one format to continue.</p> : null}
          </div>
          {batch && !generating ? <p className="text-xs text-muted-foreground">Creating again starts a new batch and replaces the results shown below. Retry a failed format from its result card to keep the other drafts.</p> : null}
        </>
      )}

      {recoveryRequired ? (
        <div role="status" className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p>A saved batch could not be restored safely. Its browser copy has been left unchanged. Current edits stay in this tab until you explicitly create a new batch or start over, which replaces that saved copy.</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={startOver}>Start over</Button>
        </div>
      ) : storageNotice ? <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{storageNotice}</p> : null}

      {batch ? (
        <GenerationResults batch={batch} busy={generating} workspaceSlug={props.mode === "workspace" ? props.workspaceSlug : undefined}
          onPreview={(id) => { setPreviewResultId(id); setPreviewOpen(false) }} onEditCourse={editCourse} onRetry={retryResult} onStartOver={startOver} />
      ) : null}

      {props.mode === "guest" && draft && !batch ? (
        <section className="grid gap-3 rounded-xl bg-[#111513] p-5 text-white">
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">
            {isExampleDraft(draft) ? "Previous example · not AI generated" : "Previous draft"} · {visualizationOptions.find((option) => option.kind === draft.kind)?.label}
          </p>
          <h2 className="text-xl font-semibold">{draft.document.title}</h2>
          <p className="line-clamp-2 max-w-3xl text-sm leading-6 text-white/68">{draft.document.summary}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
              Open draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white/72 hover:bg-white/10 hover:text-white"
              onClick={startOver}
            >
              Start over
            </Button>
            <p className="text-xs text-white/44">
              {documentCount(draft.document)} · retained in this tab; browser storage is used when available
            </p>
          </div>
        </section>
      ) : null}

      {previewDraft ? (
        <VisualizationPreview
          key={previewResult?.id ?? `legacy:${previewDraft.generatedAt}`}
          draft={previewDraft}
          note={`${isExampleDraft(previewDraft) ? "Previous example, not an AI-generated draft. " : ""}${previewNote}`}
          showSignupCta={props.mode === "guest"}
          onClose={() => { setPreviewOpen(false); setPreviewResultId(null) }}
        />
      ) : null}

      {courseEditing ? (
        <CourseEditor key={courseEditing.id} document={courseEditing.document}
          persistenceNote={props.mode === "workspace"
            ? "Apply updates this draft in this tab. Course workspace saving and publication are not available yet."
            : "Apply updates this browser draft for its existing four-hour retention when storage is available. Check any browser-storage notice after applying."}
          onApply={(document) => applyCourseChanges(courseEditing, document)}
          onCancel={() => closeCourseEditor(courseEditing)} />
      ) : null}
    </div>
  )
}
