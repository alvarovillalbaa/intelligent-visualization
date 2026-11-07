"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"

import {
  addDeckAssetAction,
  createReviewLinkAction,
  publishDeckVersionAction,
  randomizeDeckThemeAction,
  restoreCheckpointAction,
  saveDeckCheckpointAction,
  saveDeckExperimentAction,
} from "@/app/actions/decks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type {
  DeckCheckpoint,
  DeckExperiment,
  DeckRecord,
  DeckSource,
  ReviewRequest,
  SessionUser,
} from "@/lib/types"
import { formatRelativeDate } from "@/lib/utils"

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "partial"; source: DeckSource }
  | { type: "final"; source: DeckSource }
  | { type: "error"; message: string }

async function* streamResponse(response: Response) {
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) {
    return
  }

  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line) as StreamEvent
      }
    }
  }
  if (buffer.trim()) {
    yield JSON.parse(buffer) as StreamEvent
  }
}

function buildEmbedCode(embedUrl: string) {
  return `<iframe src="${embedUrl}" width="100%" height="720" style="border:0;" allowfullscreen></iframe>`
}

export function DeckEditorClient({
  sessionUser,
  deck,
  shareUrls,
}: {
  sessionUser: SessionUser
  deck: DeckRecord
  shareUrls: {
    publicUrl: string | null
    embedUrl: string | null
    artifactUrl: string | null
    publicArtifactUrls: Record<string, string>
  }
}) {
  const router = useRouter()
  const [draftSource, setDraftSource] = useState<DeckSource>(deck.source)
  const [prompt, setPrompt] = useState("Rewrite this deck with stronger proof and more contrast between problem and solution.")
  const [checkpointTitle, setCheckpointTitle] = useState("Editor checkpoint")
  const [publishLabel, setPublishLabel] = useState(`Version ${String.fromCharCode(65 + deck.versions.length)}`)
  const [publishPassword, setPublishPassword] = useState("")
  const [reviewTitle, setReviewTitle] = useState("Leadership review")
  const [activity, setActivity] = useState("Draft is in sync with the latest checkpoint.")
  const [reviewLink, setReviewLink] = useState<string | null>(null)
  const assetUploadRef = useRef<HTMLInputElement>(null)
  const [assetDraft, setAssetDraft] = useState<{
    kind: "image" | "video" | "document" | "code"
    title: string
    description: string
    url: string
  }>({
    kind: "image",
    title: "",
    description: "",
    url: "",
  })
  const [experimentName, setExperimentName] = useState(deck.experiment?.name ?? `${deck.title} experiment`)
  const [experimentQuestion, setExperimentQuestion] = useState(
    deck.experiment?.question ?? "Which published version drives stronger engagement?",
  )
  const [experimentStatus, setExperimentStatus] = useState<DeckExperiment["status"]>(deck.experiment?.status ?? "draft")
  const [variantAId, setVariantAId] = useState(deck.experiment?.variants[0]?.versionId ?? deck.versions[0]?.id ?? "")
  const [variantBId, setVariantBId] = useState(deck.experiment?.variants[1]?.versionId ?? deck.versions[1]?.id ?? deck.versions[0]?.id ?? "")
  const [variantAWeight, setVariantAWeight] = useState(String(deck.experiment?.variants[0]?.weight ?? 50))
  const [variantBWeight, setVariantBWeight] = useState(String(deck.experiment?.variants[1]?.weight ?? 50))
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [pending, startTransition] = useTransition()
  const [streaming, setStreaming] = useState(false)
  const canEdit = sessionUser.role !== "viewer"

  const currentVersion = useMemo(
    () => deck.versions.find((version) => version.id === deck.publishedVersionId) ?? deck.versions[0],
    [deck.publishedVersionId, deck.versions],
  )

  function updateManualDraft() {
    setActivity("Manual edits staged locally. Save a checkpoint when ready.")
    return draftSource
  }

  function patchSlide(index: number, patch: Partial<DeckSource["slides"][number]>) {
    setDraftSource((current) => ({
      ...current,
      slides: current.slides.map((slide, slideIndex) => (slideIndex === index ? { ...slide, ...patch } : slide)),
    }))
  }

  function patchBlock(
    slideIndex: number,
    blockIndex: number,
    updater: (block: DeckSource["slides"][number]["blocks"][number]) => DeckSource["slides"][number]["blocks"][number],
  ) {
    setDraftSource((current) => ({
      ...current,
      slides: current.slides.map((slide, currentSlideIndex) =>
        currentSlideIndex === slideIndex
          ? {
              ...slide,
              blocks: slide.blocks.map((block, currentBlockIndex) =>
                currentBlockIndex === blockIndex ? updater(block) : block,
              ),
            }
          : slide,
      ),
    }))
  }

  async function handlePromptRewrite() {
    if (!canEdit) {
      return
    }

    setStreaming(true)
    setActivity("Streaming rewrite...")
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        generationInput: {
          inputKind: "paste",
          rawText: JSON.stringify(draftSource),
          prompt,
          files: [],
          themeMode: deck.themeMode,
        },
        existingSource: draftSource,
      }),
    })

    if (!response.ok) {
      setStreaming(false)
      setActivity("Rewrite failed.")
      return
    }

    for await (const event of streamResponse(response)) {
      if (event.type === "status") {
        setActivity(event.message)
      }
      if (event.type === "partial") {
        setDraftSource(event.source)
      }
      if (event.type === "final") {
        setDraftSource(event.source)
        setActivity("Rewrite complete. Review the new draft and save a checkpoint.")
      }
    }

    setStreaming(false)
  }

  function handleSaveCheckpoint() {
    if (!canEdit) {
      return
    }

    const nextSource = updateManualDraft()
    startTransition(async () => {
      await saveDeckCheckpointAction({
        deckId: deck.id,
        prompt,
        title: checkpointTitle,
        source: nextSource,
      })
      router.refresh()
    })
  }

  function handlePublish() {
    if (!canEdit) {
      return
    }

    const nextSource = draftSource
    setActivity("Publishing…")
    startTransition(async () => {
      try {
        const version = await publishDeckVersionAction({
          deckId: deck.id,
          label: publishLabel,
          source: nextSource,
          password: publishPassword || undefined,
        })
        setActivity(`Published ${version.label}.`)
      } catch {
        setActivity("Publication could not be confirmed. Your local edits are still here. Check Published variants before trying again.")
      }
    })
  }

  function handleRandomizeTheme() {
    if (!canEdit) {
      return
    }

    startTransition(async () => {
      const remixed = await randomizeDeckThemeAction(deck.id)
      setDraftSource(remixed)
      setActivity("Theme remixed. Save a checkpoint if you want to keep it.")
      router.refresh()
    })
  }

  function handleRestore(checkpoint: DeckCheckpoint) {
    if (!canEdit) {
      return
    }

    startTransition(async () => {
      await restoreCheckpointAction(deck.id, checkpoint.id)
      setDraftSource(checkpoint.source)
      setActivity(`Restored ${checkpoint.title}.`)
      router.refresh()
    })
  }

  function handleReviewLink(versionId: string) {
    if (!canEdit) {
      return
    }

    startTransition(async () => {
      const review = await createReviewLinkAction({
        deckId: deck.id,
        versionId,
        title: reviewTitle,
      })
      setReviewLink(review.reviewUrl)
      router.refresh()
    })
  }

  function handleAddAsset() {
    if (!canEdit || !assetDraft.title || !assetDraft.url) {
      return
    }

    startTransition(async () => {
      await addDeckAssetAction({
        deckId: deck.id,
        ...assetDraft,
      })
      setAssetDraft({
        kind: "image",
        title: "",
        description: "",
        url: "",
      })
    })
  }

  async function handleUploadAsset(file: File | null) {
    if (!canEdit || !file) {
      return
    }

    setUploadingAsset(true)
    const formData = new FormData()
    formData.set("file", file)
    formData.set("deckId", deck.id)

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        setActivity("Asset upload failed.")
        return
      }

      const payload = (await response.json()) as {
        file: {
          name: string
          url: string
          storageKey: string
          contentType: string
          sizeBytes: number
        }
      }

      await addDeckAssetAction({
        deckId: deck.id,
        kind: assetDraft.kind,
        title: assetDraft.title || file.name,
        description: assetDraft.description || "Uploaded to the deck asset library.",
        url: payload.file.url,
        storageKey: payload.file.storageKey,
        contentType: payload.file.contentType,
        sizeBytes: payload.file.sizeBytes,
      })

      setAssetDraft({
        kind: "image",
        title: "",
        description: "",
        url: "",
      })
      setActivity("Asset uploaded and attached to the deck.")
    } finally {
      setUploadingAsset(false)
    }
  }

  function handleSaveExperiment() {
    if (!canEdit) {
      return
    }

    const trimmedName = experimentName.trim()
    const trimmedQuestion = experimentQuestion.trim()
    const variants = [
      {
        id: "variant-a",
        label: "Variant A",
        versionId: variantAId,
        weight: Math.max(1, Number(variantAWeight) || 50),
      },
      {
        id: "variant-b",
        label: "Variant B",
        versionId: variantBId,
        weight: Math.max(1, Number(variantBWeight) || 50),
      },
    ].filter((variant, index, list) => variant.versionId && list.findIndex((item) => item.versionId === variant.versionId) === index)

    startTransition(async () => {
      await saveDeckExperimentAction({
        deckId: deck.id,
        experiment:
          trimmedName && trimmedQuestion && variants.length >= 2
            ? {
                name: trimmedName,
                question: trimmedQuestion,
                status: experimentStatus,
                variants,
              }
            : null,
      })
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.12fr_0.9fr]">
      <div className="grid gap-6">
        <Card className="border border-foreground/8 bg-white/88">
          <CardHeader>
            <CardTitle>Prompt + source control</CardTitle>
            <CardDescription>
              Edit by prompt, then lock changes into checkpoints and published versions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!canEdit ? (
              <p className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Your role is `viewer`. You can inspect history, analytics, and review state, but you cannot change deck content.
              </p>
            ) : null}

            <div className="grid gap-2">
              <label className="text-sm font-medium">Rewrite prompt</label>
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-28" disabled={!canEdit} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Checkpoint title</label>
              <Input value={checkpointTitle} onChange={(event) => setCheckpointTitle(event.target.value)} disabled={!canEdit} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handlePromptRewrite} disabled={streaming || !canEdit}>
                {streaming ? "Streaming..." : "Rewrite live"}
              </Button>
              <Button type="button" variant="outline" onClick={handleRandomizeTheme} disabled={pending || !canEdit}>
                Surprise me
              </Button>
              <Button type="button" variant="outline" onClick={handleSaveCheckpoint} disabled={pending || !canEdit}>
                Save checkpoint
              </Button>
            </div>

            <div className="rounded-[24px] border border-foreground/8 bg-muted/35 p-4">
              <p className="text-sm font-medium">Publishing</p>
              <div className="mt-3 grid gap-3">
                <Input aria-label="Version label" value={publishLabel} onChange={(event) => setPublishLabel(event.target.value)} disabled={!canEdit} />
                <Input
                  type="password"
                  placeholder="Optional password"
                  value={publishPassword}
                  onChange={(event) => setPublishPassword(event.target.value)}
                  disabled={!canEdit}
                />
                <Button type="button" onClick={handlePublish} disabled={pending || !canEdit}>
                  Publish version
                </Button>
              </div>
            </div>

            <div className="rounded-[24px] border border-foreground/8 bg-[#102114] p-4 text-white">
              <p className="text-sm font-medium text-white">Review links</p>
              <div className="mt-3 grid gap-3">
                <Input
                  value={reviewTitle}
                  onChange={(event) => setReviewTitle(event.target.value)}
                  className="border-white/12 bg-white/8 text-white placeholder:text-white/36"
                  disabled={!canEdit}
                />
                <Button
                  type="button"
                  className="bg-white text-[#102114] hover:bg-white/90"
                  onClick={() => currentVersion && handleReviewLink(currentVersion.id)}
                  disabled={pending || !currentVersion || !canEdit}
                >
                  Generate review link
                </Button>
                {reviewLink ? (
                  <a href={reviewLink} target="_blank" rel="noreferrer" className="text-sm text-white/78 underline">
                    {reviewLink}
                  </a>
                ) : null}
              </div>
            </div>

            <Card className="border border-foreground/8 bg-muted/20 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Share surface</CardTitle>
                <CardDescription>Every deck has a public slug URL and an embeddable iframe target.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {shareUrls.publicUrl && shareUrls.embedUrl ? (
                  <>
                    <ReadOnlyField label="Hosted URL" value={shareUrls.publicUrl} />
                    <ReadOnlyField label="Embed URL" value={shareUrls.embedUrl} />
                    {shareUrls.artifactUrl ? <ReadOnlyField label="Immutable artifact" value={shareUrls.artifactUrl} /> : null}
                    <div className="grid gap-2">
                      <label className="text-sm font-medium">Iframe snippet</label>
                      <Textarea readOnly value={buildEmbedCode(shareUrls.embedUrl)} className="min-h-28 bg-white" />
                    </div>
                  </>
                ) : <p className="text-sm text-muted-foreground">Publish a version to create share links.</p>}
              </CardContent>
            </Card>

            <p role="status" aria-live="polite" className="rounded-[24px] border border-foreground/8 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {activity}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card className="overflow-hidden border border-[#102114]/10 bg-[#0f1724] text-white">
          <CardHeader className="border-b border-white/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-white">{draftSource.title}</CardTitle>
                <CardDescription className="text-white/62">{draftSource.summary}</CardDescription>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/55">
                {sessionUser.role}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 p-6">
            {draftSource.brand.brandKit ? (
              <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/45">On-brand kit</p>
                    <p className="mt-2 text-lg font-semibold text-white">{draftSource.brand.companyName}</p>
                    <p className="mt-2 text-sm text-white/70">{draftSource.brand.voice}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.values(draftSource.brand.brandKit.colors)
                      .slice(0, 5)
                      .map((color) => (
                        <span
                          key={color}
                          className="size-8 rounded-full border border-white/20"
                          style={{ background: color }}
                          title={color}
                        />
                      ))}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-white/68">
                  <p>Fonts: {draftSource.brand.brandKit.fonts.slice(0, 3).join(", ") || "Not detected"}</p>
                  <p>Brand notes: {draftSource.brand.brandKit.notes.slice(0, 3).join(" • ") || "No extra guidance"}</p>
                  <p>Taglines: {draftSource.brand.brandKit.taglines?.slice(0, 2).join(" • ") || "Not detected"}</p>
                  <p>Audience: {draftSource.brand.brandKit.audiences?.slice(0, 2).join(" • ") || "Not detected"}</p>
                  <p>
                    Typography:
                    {" "}
                    {draftSource.brand.brandKit.typography?.display[0] || draftSource.brand.brandKit.typography?.body[0]
                      ? [
                          draftSource.brand.brandKit.typography?.display[0] && `Display ${draftSource.brand.brandKit.typography.display[0]}`,
                          draftSource.brand.brandKit.typography?.body[0] && `Body ${draftSource.brand.brandKit.typography.body[0]}`,
                        ]
                          .filter(Boolean)
                          .join(" • ")
                      : "Not detected"}
                  </p>
                </div>
              </section>
            ) : null}

            <div className="grid gap-4">
              {draftSource.slides.map((slide, index) => (
                <article key={slide.id} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-white/45">
                    <span>{slide.kicker}</span>
                    <span>Slide {index + 1}</span>
                  </div>
                  <Input
                    value={slide.title}
                    onChange={(event) => patchSlide(index, { title: event.target.value })}
                    className="border-white/12 bg-white/6 text-lg text-white placeholder:text-white/40"
                    disabled={!canEdit}
                  />
                  <Textarea
                    value={slide.summary}
                    onChange={(event) => patchSlide(index, { summary: event.target.value })}
                    className="mt-3 min-h-20 border-white/12 bg-white/6 text-white placeholder:text-white/40"
                    disabled={!canEdit}
                  />
                  <div className="mt-3 grid gap-3">
                    {slide.blocks.map((block, blockIndex) => (
                      <BlockEditor
                        key={`${slide.id}-${blockIndex}`}
                        block={block}
                        disabled={!canEdit}
                        onChange={(nextBlock) => patchBlock(index, blockIndex, () => nextBlock)}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card className="border border-foreground/8 bg-white/88">
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Checkpoint and version history with review-ready labels.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {deck.checkpoints.map((checkpoint) => (
              <button
                key={checkpoint.id}
                type="button"
                onClick={() => handleRestore(checkpoint)}
                className="rounded-[24px] border border-foreground/8 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
                disabled={!canEdit}
              >
                <p className="text-sm font-medium text-foreground">{checkpoint.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{checkpoint.summary}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {formatRelativeDate(checkpoint.createdAt)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-foreground/8 bg-white/88">
          <CardHeader>
            <CardTitle>Published variants</CardTitle>
            <CardDescription>A/B test candidates, routing state, and public-facing versions.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3">
              {deck.versions.map((version) => (
                <article key={version.id} className="rounded-[24px] border border-foreground/8 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{version.label}</p>
                    <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {formatRelativeDate(version.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{version.source.title}</p>
                  {deck.publishedVersionId === version.id ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-emerald-700">Currently routed live</p>
                  ) : null}
                  {Object.hasOwn(shareUrls.publicArtifactUrls, version.id) ? (
                    <a href={shareUrls.publicArtifactUrls[version.id]} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-primary underline">
                      Open immutable artifact
                    </a>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="rounded-[24px] border border-foreground/8 bg-muted/20 p-4">
              <p className="text-sm font-medium">Experiment runtime</p>
              <div className="mt-3 grid gap-3">
                <Input value={experimentName} onChange={(event) => setExperimentName(event.target.value)} disabled={!canEdit} />
                <Textarea value={experimentQuestion} onChange={(event) => setExperimentQuestion(event.target.value)} disabled={!canEdit} />
                <div className="flex flex-wrap gap-2">
                  {(["draft", "running", "paused"] as const).map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={experimentStatus === status ? "default" : "outline"}
                      onClick={() => setExperimentStatus(status)}
                      disabled={!canEdit}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <VariantSelector
                    label="Variant A"
                    value={variantAId}
                    onChange={setVariantAId}
                    versions={deck.versions}
                    disabled={!canEdit}
                  />
                  <VariantSelector
                    label="Variant B"
                    value={variantBId}
                    onChange={setVariantBId}
                    versions={deck.versions}
                    disabled={!canEdit}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={variantAWeight} onChange={(event) => setVariantAWeight(event.target.value)} disabled={!canEdit} />
                  <Input value={variantBWeight} onChange={(event) => setVariantBWeight(event.target.value)} disabled={!canEdit} />
                </div>
                <Button type="button" onClick={handleSaveExperiment} disabled={pending || !canEdit}>
                  Save experiment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-foreground/8 bg-white/88">
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <CardDescription>Generation files, brand imagery, and manually attached media for the deck.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3">
              {deck.assets.map((asset) => (
                <article key={asset.id} className="rounded-[24px] border border-foreground/8 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{asset.title}</p>
                    <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{asset.kind}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{asset.description}</p>
                  <a href={asset.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm text-primary underline">
                    Open asset
                  </a>
                </article>
              ))}
            </div>
            <div className="rounded-[24px] border border-dashed border-foreground/12 bg-muted/20 p-4">
              <p className="text-sm font-medium">Add asset by URL or upload</p>
              <div className="mt-3 grid gap-3">
                <input
                  ref={assetUploadRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    void handleUploadAsset(event.target.files?.[0] ?? null)
                    event.target.value = ""
                  }}
                />
                <select
                  value={assetDraft.kind}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      kind: event.target.value as "image" | "video" | "document" | "code",
                    }))
                  }
                  className="h-10 rounded-md border border-input bg-white px-3 text-sm"
                  disabled={!canEdit}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="document">Document</option>
                  <option value="code">Code</option>
                </select>
                <Input
                  value={assetDraft.title}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Asset title"
                  disabled={!canEdit}
                />
                <Input
                  value={assetDraft.url}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, url: event.target.value }))}
                  placeholder="https://..."
                  disabled={!canEdit}
                />
                <Textarea
                  value={assetDraft.description}
                  onChange={(event) => setAssetDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Why this asset matters in the deck"
                  disabled={!canEdit}
                />
                <Button type="button" onClick={handleAddAsset} disabled={pending || !canEdit}>
                  Add asset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => assetUploadRef.current?.click()}
                  disabled={uploadingAsset || !canEdit}
                >
                  {uploadingAsset ? "Uploading..." : "Upload file"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-foreground/8 bg-white/88">
          <CardHeader>
            <CardTitle>Analytics + review</CardTitle>
            <CardDescription>Public view performance and active review threads.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Views" value={deck.analytics.views} />
              <MetricCard label="Leads" value={deck.analytics.leads} />
              <MetricCard label="CTA clicks" value={deck.analytics.ctaClicks} />
              <MetricCard label="Completion %" value={`${deck.analytics.completionRate}%`} />
            </div>
            {Object.keys(deck.analytics.variantMetrics ?? {}).length ? (
              <div className="grid gap-3">
                {deck.versions
                  .filter((version) => deck.analytics.variantMetrics?.[version.id])
                  .map((version) => {
                    const metrics = deck.analytics.variantMetrics?.[version.id]
                    if (!metrics) {
                      return null
                    }
                    return (
                      <article key={version.id} className="rounded-[24px] border border-foreground/8 bg-muted/20 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{version.label}</p>
                          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{metrics.uniqueVisitors} visitors</span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {metrics.views} views · {metrics.completions} completions · {metrics.ctaClicks} CTA clicks · {metrics.leads} leads
                        </p>
                      </article>
                    )
                  })}
              </div>
            ) : null}
            <div className="grid gap-3">
              {deck.reviewRequests.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <Input readOnly value={value} className="bg-white" />
    </div>
  )
}

function VariantSelector({
  label,
  value,
  onChange,
  versions,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  versions: DeckRecord["versions"]
  disabled: boolean
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-input bg-white px-3 text-sm"
        disabled={disabled}
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.label} · {version.source.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function BlockEditor({
  block,
  disabled,
  onChange,
}: {
  block: DeckSource["slides"][number]["blocks"][number]
  disabled: boolean
  onChange: (nextBlock: DeckSource["slides"][number]["blocks"][number]) => void
}) {
  if (block.kind === "paragraph") {
    return (
      <Textarea
        value={block.text}
        onChange={(event) => onChange({ ...block, text: event.target.value })}
        className="min-h-28 border-white/12 bg-white/6 text-white placeholder:text-white/40"
        disabled={disabled}
      />
    )
  }

  if (block.kind === "bullets") {
    return (
      <Textarea
        value={block.items.join("\n")}
        onChange={(event) =>
          onChange({
            ...block,
            items: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean),
          })
        }
        className="min-h-28 border-white/12 bg-white/6 text-white placeholder:text-white/40"
        disabled={disabled}
      />
    )
  }

  if (block.kind === "timeline") {
    return (
      <Textarea
        value={block.items.map((item) => `${item.label}: ${item.detail}`).join("\n")}
        onChange={(event) =>
          onChange({
            ...block,
            items: event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [label, ...detailParts] = line.split(":")
                return {
                  label: label?.trim() || "Milestone",
                  detail: detailParts.join(":").trim() || "Add detail",
                }
              }),
          })
        }
        className="min-h-28 border-white/12 bg-white/6 text-white placeholder:text-white/40"
        disabled={disabled}
      />
    )
  }

  if (block.kind === "stats") {
    return (
      <Textarea
        value={block.items.map((item) => `${item.label} | ${item.value} | ${item.detail}`).join("\n")}
        onChange={(event) =>
          onChange({
            ...block,
            items: event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [label, value, detail] = line.split("|").map((item) => item.trim())
                return {
                  label: label || "Metric",
                  value: value || "0",
                  detail: detail || "Add context",
                }
              }),
          })
        }
        className="min-h-28 border-white/12 bg-white/6 text-white placeholder:text-white/40"
        disabled={disabled}
      />
    )
  }

  if (block.kind === "quote") {
    return (
      <div className="grid gap-3">
        <Textarea
          value={block.quote}
          onChange={(event) => onChange({ ...block, quote: event.target.value })}
          className="min-h-20 border-white/12 bg-white/6 text-white placeholder:text-white/40"
          disabled={disabled}
        />
        <Input
          value={block.byline}
          onChange={(event) => onChange({ ...block, byline: event.target.value })}
          className="border-white/12 bg-white/6 text-white placeholder:text-white/40"
          disabled={disabled}
        />
      </div>
    )
  }

  if (block.kind === "callout") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={block.label}
          onChange={(event) => onChange({ ...block, label: event.target.value })}
          className="border-white/12 bg-white/6 text-white placeholder:text-white/40"
          disabled={disabled}
        />
        <Input
          value={block.value}
          onChange={(event) => onChange({ ...block, value: event.target.value })}
          className="border-white/12 bg-white/6 text-white placeholder:text-white/40"
          disabled={disabled}
        />
      </div>
    )
  }

  return (
    <Textarea
      value={block.code}
      onChange={(event) => onChange({ ...block, code: event.target.value })}
      className="min-h-36 border-white/12 bg-white/6 font-mono text-white placeholder:text-white/40"
      disabled={disabled}
    />
  )
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[24px] border border-foreground/8 bg-muted/25 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function ReviewCard({ review }: { review: ReviewRequest }) {
  const unresolvedCount = review.comments.filter((comment) => comment.status !== "resolved").length

  return (
    <article className="rounded-[24px] border border-foreground/8 bg-muted/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{review.title}</p>
        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{review.status.replace("_", " ")}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {review.comments.length} comments, {unresolvedCount} unresolved, updated {formatRelativeDate(review.createdAt)}.
      </p>
      <Link href={`/review/${review.token}`} className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">
        Open review surface
      </Link>
    </article>
  )
}
