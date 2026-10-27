"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
import {
  clearGuestDraft,
  loadGuestDraft,
  storeGuestDraft,
  type GeneratedDraft,
} from "@/lib/client/guest-draft"
import { readFiles, type ImportedFile } from "@/lib/client/import-files"
import { restoreSourceText, serializeSourceText } from "@/lib/client/composer-source-input"
import { extractUrls, urlDomain } from "@/lib/detect-urls"
import { remixTheme, themeLibrary } from "@/lib/deck-runtime"
import type { BrandKit, GenerationInput, ThemeTokens } from "@/lib/types"
import type { VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"
import { cn } from "@/lib/utils"

const DEFAULT_PROMPT = "Create a polished visual document from this source."
const EXTRACTION_TIMEOUT_MS = 15_000

type ComposerProps =
  | { mode: "guest" }
  | { mode: "workspace"; workspaceId: string; workspaceSlug: string }

type StyleDecision = "accepted" | "shuffled" | "skipped" | null

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
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)
  const textInputId = useId()
  const hydratedRef = useRef(props.mode !== "guest")

  const [step, setStep] = useState<"source" | "configure">("source")
  const [textEntries, setTextEntries] = useState<string[]>([])
  const [pendingText, setPendingText] = useState("")
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [dismissedUrls, setDismissedUrls] = useState<string[]>([])
  const [selectedKind, setSelectedKind] = useState<VisualizationKind>("slides")
  const [style, setStyle] = useState<StyleState>({ status: "idle" })
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [draft, setDraft] = useState<GeneratedDraft | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const rawText = useMemo(() => serializeSourceText({ entries: textEntries, pending: pendingText }), [textEntries, pendingText])

  const detectedUrl = useMemo(() => {
    return extractUrls(rawText).find((url) => !dismissedUrls.includes(url)) ?? null
  }, [dismissedUrls, rawText])

  const hasInput = Boolean(rawText.trim() || files.length)

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

      const restored = restoreSourceText(stored.input)
      const multilinePending = /[\r\n]/.test(restored.pending)
      setTextEntries(multilinePending ? [...restored.entries, restored.pending] : restored.entries)
      setPendingText(multilinePending ? "" : restored.pending)
      setFiles(stored.input.files)
      setSelectedKind(stored.selectedKind)
      setDraft(stored.draft)
    })

    return () => {
      cancelled = true
    }
  }, [props.mode])

  useEffect(() => {
    if (props.mode !== "guest" || !hydratedRef.current) {
      return
    }

    storeGuestDraft({
      input: { rawText, files, textEntries, pendingText },
      selectedKind,
      draft,
    })
  }, [draft, files, props.mode, rawText, selectedKind, textEntries, pendingText])

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

    setImporting(true)
    const imported = await readFiles(fileList)
    setFiles((current) => {
      const existing = new Set(current.map((file) => file.name))
      return [...current, ...imported.filter((file) => !existing.has(file.name))]
    })
    setImporting(false)
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

  async function handleCreate() {
    if (generating) {
      return
    }

    setGenerating(true)
    setError(null)

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

    const generationInput: GenerationInput = {
      inputKind: detectedUrl ? "url" : files.length ? "files" : "paste",
      rawText,
      sourceUrl: detectedUrl ?? undefined,
      prompt: DEFAULT_PROMPT,
      files: files.map(({ name, content, type }) => ({ name, content, type })),
      themeMode,
      brandContext,
      themeOverride,
    }

    try {
      const response = await fetch("/api/visualizations/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: selectedKind, generationInput }),
      })

      if (!response.ok) {
        setError("Generation failed. Please try again.")
        return
      }

      const generated = (await response.json()) as GeneratedDraft

      if (props.mode === "workspace" && selectedKind === "slides" && generated.deckSource) {
        const result = await createDeckFromGeneratedSourceAction({
          workspaceId: props.workspaceId,
          generationInput,
          source: generated.deckSource,
        })
        router.push(`/app/workspaces/${props.workspaceSlug}/decks/${result.deckId}`)
        return
      }

      setDraft(generated)
      setPreviewOpen(true)
    } catch {
      setError("Generation failed. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  function startOver() {
    setStep("source")
    setTextEntries([])
    setPendingText("")
    setFiles([])
    setDismissedUrls([])
    setSelectedKind("slides")
    setStyle({ status: "idle" })
    setDraft(null)
    setPreviewOpen(false)
    setError(null)
    if (props.mode === "guest") {
      clearGuestDraft()
    }
  }

  const extractionPending = style.status === "loading"
  const awaitingStyleDecision = style.status === "ready" && style.decision === null
  const createDisabled = generating || extractionPending || awaitingStyleDecision || !hasInput

  const sourceSummary = [
    rawText.trim() ? `${rawText.trim().length.toLocaleString()} characters` : null,
    detectedUrl ? urlDomain(detectedUrl) : null,
    files.length ? `${files.length} ${files.length === 1 ? "file" : "files"}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const previewNote =
    props.mode === "workspace" && draft && draft.kind !== "slides"
      ? `${draft.kind === "course" ? "Course" : "Report"} drafts aren't saved yet.`
      : undefined

  return (
    <div className="grid gap-4">
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
            onClick={() => setStep("source")}
            className="flex items-center justify-between gap-3 rounded-xl bg-white px-5 py-3.5 text-left shadow-sm transition hover:bg-[#fbfaf6]"
          >
            <span className="truncate text-sm text-muted-foreground">{sourceSummary || "No source yet"}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium">
              <PencilLineIcon className="size-3.5" />
              Edit
            </span>
          </button>

          <section className="grid gap-3 sm:grid-cols-3">
            {visualizationOptions.map((option) => {
              const Icon = option.icon
              const active = selectedKind === option.kind
              return (
                <button
                  key={option.kind}
                  type="button"
                  className={cn(
                    "grid gap-3 rounded-xl bg-white p-5 text-left shadow-sm transition",
                    active ? "ring-2 ring-[#111513]" : "hover:bg-[#fbfaf6]",
                  )}
                  onClick={() => setSelectedKind(option.kind)}
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
            <Button type="button" size="lg" disabled={createDisabled} onClick={handleCreate}>
              {generating || extractionPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {generating ? "Generating" : extractionPending ? "Reading style…" : "Create draft"}
            </Button>
            {awaitingStyleDecision ? (
              <p className="text-sm text-muted-foreground">Choose a style to continue.</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </>
      )}

      {props.mode === "guest" && draft ? (
        <section className="grid gap-3 rounded-xl bg-[#111513] p-5 text-white">
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">
            {visualizationOptions.find((option) => option.kind === draft.kind)?.label}
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
              {documentCount(draft.document)} · stored in this browser for 4 hours
            </p>
          </div>
        </section>
      ) : null}

      {previewOpen && draft ? (
        <VisualizationPreview
          key={draft.generatedAt}
          draft={draft}
          note={previewNote}
          showSignupCta={props.mode === "guest"}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  )
}
