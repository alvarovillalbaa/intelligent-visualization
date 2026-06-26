"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  BarChart3Icon,
  CheckIcon,
  FileTextIcon,
  GraduationCapIcon,
  LinkIcon,
  Loader2Icon,
  PresentationIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { GenerationInput } from "@/lib/types"
import type { VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "iv:guest-draft:v1"
const FOUR_HOURS_MS = 1000 * 60 * 60 * 4
const MAX_STORED_CONTENT = 12_000
const MAX_PREVIEW_BYTES = 250_000

type ImportedFile = GenerationInput["files"][number] & {
  size?: number
  previewDataUrl?: string
}

type GeneratedDraft = {
  kind: VisualizationKind
  document: VisualizationDocument
  deckSource?: unknown
  provider: string
  modelName: string
  generatedAt: number
}

type StoredGuestDraft = {
  version: 1
  input: {
    rawText: string
    sourceUrl: string
    prompt: string
    themeMode: GenerationInput["themeMode"]
  }
  selectedKind: VisualizationKind
  files: ImportedFile[]
  draft: GeneratedDraft | null
  status: string
  savedAt: number
  expiresAt: number
}

const visualizationOptions: Array<{
  kind: VisualizationKind
  label: string
  detail: string
  icon: typeof PresentationIcon
}> = [
  {
    kind: "slides",
    label: "Slides deck",
    detail: "A narrative sequence for presenting, pitching, or publishing.",
    icon: PresentationIcon,
  },
  {
    kind: "course",
    label: "Course",
    detail: "A lesson structure with objectives, explanation, and practice.",
    icon: GraduationCapIcon,
  },
  {
    kind: "report",
    label: "Report",
    detail: "A decision document with summary, evidence, and visual blocks.",
    icon: BarChart3Icon,
  },
]

function clipContent(value: string) {
  return value.length > MAX_STORED_CONTENT ? `${value.slice(0, MAX_STORED_CONTENT)}...` : value
}

function filePreview(file: File) {
  if (!file.type.startsWith("image/") || file.size > MAX_PREVIEW_BYTES) {
    return Promise.resolve<string | undefined>(undefined)
  }

  return new Promise<string | undefined>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

async function fallbackFileContext(files: File[]) {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      previewDataUrl: await filePreview(file),
      content: clipContent(
        await file
          .text()
          .catch(
            () =>
              [
                `Uploaded asset: ${file.name}`,
                `Type: ${file.type || "unknown"}`,
                `Size: ${file.size} bytes`,
              ].join("\n"),
          ),
      ),
    })),
  )
}

async function readFiles(fileList: FileList | null) {
  const files = Array.from(fileList ?? [])
  if (!files.length) {
    return []
  }

  const formData = new FormData()
  for (const file of files) {
    formData.append("files", file)
  }

  const response = await fetch("/api/file-context", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    return fallbackFileContext(files)
  }

  const payload = (await response.json()) as {
    files: Array<{ name: string; type: string; content: string }>
  }
  const previews = await Promise.all(files.map((file) => filePreview(file)))

  return payload.files.map((file, index) => ({
    ...file,
    size: files[index]?.size,
    content: clipContent(file.content),
    previewDataUrl: previews[index],
  }))
}

function loadStoredDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as StoredGuestDraft
    if (parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function storeDraft(snapshot: StoredGuestDraft) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    const compact: StoredGuestDraft = {
      ...snapshot,
      files: snapshot.files.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        content: clipContent(file.content.slice(0, 4000)),
      })),
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact))
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }
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

export function GuestImportFlow() {
  const fileRef = useRef<HTMLInputElement>(null)
  const hydratedRef = useRef(false)
  const [rawText, setRawText] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [prompt, setPrompt] = useState("Create a polished visual document from this source.")
  const [themeMode, setThemeMode] = useState<GenerationInput["themeMode"]>("brand")
  const [files, setFiles] = useState<ImportedFile[]>([])
  const [selectedKind, setSelectedKind] = useState<VisualizationKind>("slides")
  const [generatedDraft, setGeneratedDraft] = useState<GeneratedDraft | null>(null)
  const [status, setStatus] = useState("Ready")
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      const stored = loadStoredDraft()
      hydratedRef.current = true
      if (!stored) {
        return
      }

      setRawText(stored.input.rawText)
      setSourceUrl(stored.input.sourceUrl)
      setPrompt(stored.input.prompt)
      setThemeMode(stored.input.themeMode)
      setFiles(stored.files)
      setSelectedKind(stored.selectedKind)
      setGeneratedDraft(stored.draft)
      setStatus(stored.status)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) {
      return
    }

    const now = Date.now()
    storeDraft({
      version: 1,
      input: {
        rawText,
        sourceUrl,
        prompt,
        themeMode,
      },
      selectedKind,
      files,
      draft: generatedDraft,
      status,
      savedAt: now,
      expiresAt: now + FOUR_HOURS_MS,
    })
  }, [files, generatedDraft, prompt, rawText, selectedKind, sourceUrl, status, themeMode])

  const hasInput = useMemo(
    () => Boolean(rawText.trim() || sourceUrl.trim() || files.length),
    [files.length, rawText, sourceUrl],
  )

  async function handleFiles(fileList: FileList | null) {
    setImporting(true)
    setStatus("Importing files")
    const imported = await readFiles(fileList)
    setFiles((current) => [...current, ...imported])
    setStatus(imported.length ? "Files imported" : "Ready")
    setImporting(false)
  }

  async function handleGenerate() {
    if (!hasInput || generating) {
      return
    }

    setGenerating(true)
    setStatus("Generating draft")

    const generationInput: GenerationInput = {
      inputKind: sourceUrl.trim() ? "url" : files.length ? "files" : "paste",
      rawText,
      sourceUrl: sourceUrl.trim() || undefined,
      prompt,
      files,
      themeMode,
    }

    const response = await fetch("/api/visualizations/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: selectedKind,
        generationInput,
      }),
    })

    if (!response.ok) {
      setStatus("Generation failed")
      setGenerating(false)
      return
    }

    const draft = (await response.json()) as GeneratedDraft
    setGeneratedDraft(draft)
    setStatus("Draft ready")
    setDialogOpen(true)
    setGenerating(false)
  }

  function removeFile(name: string) {
    setFiles((current) => current.filter((file) => file.name !== name))
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#171a17]">
      <div className="grid min-h-screen lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex flex-col justify-between bg-[#111513] px-6 py-6 text-white lg:min-h-screen">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-white text-sm font-semibold text-[#111513]">
                IV
              </div>
              <div>
                <p className="text-sm font-semibold">Intelligent Visualization</p>
                <p className="text-xs text-white/56">Local draft expires in 4 hours</p>
              </div>
            </div>
            <div className="mt-10 space-y-4 text-sm text-white/70">
              <p className="text-white">{status}</p>
              <p>{files.length} files imported</p>
              {generatedDraft ? <p>{documentCount(generatedDraft.document)} generated</p> : null}
            </div>
          </div>
          <Button nativeButton={false} render={<Link href="/auth?mode=signup&returnTo=/app" />} className="mt-8">
            Sign up
          </Button>
        </aside>

        <section className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <div className="mx-auto grid max-w-5xl gap-8">
            <header className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Import</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Start with your source material.
              </h1>
            </header>

            <section className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="guest-source">
                  Source text
                </label>
                <Textarea
                  id="guest-source"
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Paste notes, a memo, transcript, outline, data summary, or any source text."
                  className="min-h-44 resize-y border-0 bg-white shadow-sm"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://..."
                    className="border-0 bg-white pl-10 shadow-sm"
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <UploadIcon />
                  Import files
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => handleFiles(event.target.files)}
                />
              </div>

              {files.length ? (
                <div className="flex flex-wrap gap-2">
                  {files.map((file) => (
                    <span
                      key={file.name}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm"
                    >
                      <FileTextIcon className="size-3" />
                      {file.name}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removeFile(file.name)}
                      >
                        <XIcon className="size-3" />
                        <span className="sr-only">Remove {file.name}</span>
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="guest-prompt">
                  Direction
                </label>
                <Textarea
                  id="guest-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-24 border-0 bg-white shadow-sm"
                />
              </div>
            </section>

            {hasInput ? (
              <section className="grid gap-3">
                {visualizationOptions.map((option) => {
                  const Icon = option.icon
                  const active = selectedKind === option.kind
                  return (
                    <button
                      key={option.kind}
                      type="button"
                      className={cn(
                        "grid gap-4 rounded-lg bg-white p-5 text-left shadow-sm transition md:grid-cols-[auto_minmax(0,1fr)_auto]",
                        active ? "ring-2 ring-[#111513]" : "hover:bg-[#fbfaf6]",
                      )}
                      onClick={() => setSelectedKind(option.kind)}
                    >
                      <span className="grid size-11 place-items-center rounded-md bg-[#111513] text-white">
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <span className="block text-lg font-semibold">{option.label}</span>
                        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.detail}</span>
                      </span>
                      {active ? <CheckIcon className="size-5 self-center" /> : null}
                    </button>
                  )
                })}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button type="button" size="lg" disabled={!hasInput || importing || generating} onClick={handleGenerate}>
                    {generating ? <Loader2Icon className="animate-spin" /> : null}
                    {generating ? "Generating" : "Create draft"}
                  </Button>
                  <Button
                    type="button"
                    variant={themeMode === "brand" ? "default" : "outline"}
                    onClick={() => setThemeMode("brand")}
                  >
                    Brand
                  </Button>
                  <Button
                    type="button"
                    variant={themeMode === "remix" ? "default" : "outline"}
                    onClick={() => setThemeMode("remix")}
                  >
                    Remix
                  </Button>
                </div>
              </section>
            ) : null}

            {generatedDraft ? (
              <section className="grid gap-3 rounded-lg bg-[#111513] p-5 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                  {visualizationOptions.find((option) => option.kind === generatedDraft.kind)?.label}
                </p>
                <h2 className="text-2xl font-semibold">{generatedDraft.document.title}</h2>
                <p className="max-w-3xl text-sm leading-6 text-white/68">{generatedDraft.document.summary}</p>
                <p className="text-sm text-white/56">
                  {documentCount(generatedDraft.document)} - {generatedDraft.provider} / {generatedDraft.modelName}
                </p>
              </section>
            ) : null}
          </div>
        </section>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You will lose it unless you sign up</DialogTitle>
            <DialogDescription>
              This draft is only stored in this browser for 4 hours.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Keep editing
            </Button>
            <Button nativeButton={false} render={<Link href="/auth?mode=signup&returnTo=/app" />}>
              Sign up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
