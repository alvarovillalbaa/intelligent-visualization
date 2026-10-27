import { describe, expect, it } from "vitest"

import {
  createGenerationBatch, normalizeGenerationKinds, restoreGenerationBatch,
  stripBatchArtifacts, updateGenerationResult, type GenerationBatch, type GenerationResultPatch,
} from "@/lib/client/generation-batch"
import { loadGuestDraft, storeGuestDraft, type GeneratedDraft, type StoredGuestDraft } from "@/lib/client/guest-draft"
import type { GenerationInput } from "@/lib/types"
import { createStarterCourseDocument, createStarterReportDocument, createStarterSlidesDocument } from "@/packages/domain/fixtures"
import type { VisualizationKind } from "@/packages/domain/entities"

const STORAGE_KEY = "iv:guest-draft:v2"

function sourceInput(): GenerationInput {
  return { inputKind: "paste", rawText: "  Authored source\r\nsecond line  ", prompt: "Explain this source", files: [], themeMode: "brand" }
}

function draft(kind: VisualizationKind): GeneratedDraft {
  const document = kind === "slides" ? createStarterSlidesDocument() : kind === "course" ? createStarterCourseDocument() : createStarterReportDocument()
  return { kind, document, provider: "authored-test-provider", modelName: "authored-test-model", generatedAt: 123,
    artifactHtml: `<html><body>Authored ${kind} compiled fixture</body></html>` }
}

function completedBatch(kinds: VisualizationKind[] = ["slides", "course", "report"]): GenerationBatch {
  let batch = createGenerationBatch(kinds, sourceInput(), "authored-batch", 123)
  for (const result of batch.results) batch = updateGenerationResult(batch, result.id, { status: "completed", draft: draft(result.kind) })
  return batch
}

describe("generation batch state", () => {
  it("creates one result per selected kind in canonical display order with stable identities", () => {
    expect(normalizeGenerationKinds(["report", "slides", "report", "course"])).toEqual(["slides", "course", "report"])
    const batch = createGenerationBatch(["report", "course", "report"], sourceInput(), "batch-id", 42)
    expect(batch.results.map(({ id, kind, status, draft, error, saveStatus }) => ({ id, kind, status, draft, error, saveStatus }))).toEqual([
      { id: "batch-id:course", kind: "course", status: "queued", draft: null, error: null, saveStatus: "idle" },
      { id: "batch-id:report", kind: "report", status: "queued", draft: null, error: null, saveStatus: "idle" },
    ])
    expect(() => createGenerationBatch([], sourceInput(), "batch", 42)).toThrow()
    expect(() => normalizeGenerationKinds(["unknown"] as VisualizationKind[])).toThrow()
    expect(() => createGenerationBatch(["slides"], sourceInput(), " ", 42)).toThrow()
    expect(() => createGenerationBatch(["slides"], sourceInput(), "batch", Number.NaN)).toThrow()
  })

  it("deeply clones frozen retry input including nested files, theme, and brand context", () => {
    const input = { ...sourceInput(), files: [{ name: "authored.txt", type: "text/plain", content: "original file" }],
      brandContext: { brandKit: { source: "manual" as const, fonts: ["Local font"], colors: { primary: "#123456" }, logos: [], imagery: [], notes: [], raw: { evidence: ["original"] } } } }
    const batch = createGenerationBatch(["slides"], input, "frozen-input", 42)
    input.rawText = "edited source"
    input.files[0].content = "edited file"
    input.brandContext.brandKit.colors.primary = "#ffffff"
    input.brandContext.brandKit.raw.evidence[0] = "edited evidence"
    expect(batch.input.rawText).toBe("  Authored source\r\nsecond line  ")
    expect(batch.input.files[0].content).toBe("original file")
    expect(batch.input.brandContext?.brandKit?.colors.primary).toBe("#123456")
    expect(batch.input.brandContext?.brandKit?.raw).toEqual({ evidence: ["original"] })
  })

  it("retries a failed result without mutating or replacing completed and saved results", () => {
    let batch = createGenerationBatch(["course", "slides"], sourceInput(), "partial", 42)
    batch = updateGenerationResult(batch, "partial:slides", { status: "completed", draft: draft("slides"), saveStatus: "saved", savedDeckId: "existing-deck" })
    const partial = updateGenerationResult(batch, "partial:course", { status: "failed", error: "Authored provider failure" })
    const retry = updateGenerationResult(partial, "partial:course", { status: "queued", error: null })
    expect(retry).not.toBe(partial)
    expect(retry.results[0]).toBe(partial.results[0])
    expect(retry.results[0].savedDeckId).toBe("existing-deck")
    expect(retry.results[1].status).toBe("queued")
    expect(partial.results[1].status).toBe("failed")
    expect(batch.results[1].status).toBe("queued")
    expect(updateGenerationResult(retry, "another-batch:course", { status: "running" })).toBe(retry)
  })

  it("protects stable ids and rejects incomplete or mismatched completion and save updates", () => {
    const batch = createGenerationBatch(["slides"], sourceInput(), "stable", 42)
    const changed = updateGenerationResult(batch, "stable:slides", { id: "forged", kind: "report", status: "running" } as unknown as GenerationResultPatch)
    expect(changed.results[0].id).toBe("stable:slides")
    expect(changed.results[0].kind).toBe("slides")
    expect(() => updateGenerationResult(batch, "stable:slides", { status: "completed" })).toThrow()
    expect(() => updateGenerationResult(batch, "stable:slides", { status: "completed", draft: draft("course") })).toThrow()
    expect(() => updateGenerationResult(batch, "stable:slides", { saveStatus: "saved" })).toThrow()
  })

  it("restores unfinished generation as interrupted and in-flight saves as uncertain", () => {
    let batch = createGenerationBatch(["slides", "course", "report"], sourceInput(), "restore", 42)
    batch = updateGenerationResult(batch, "restore:slides", { status: "completed", draft: draft("slides"), saveStatus: "saving" })
    batch = updateGenerationResult(batch, "restore:course", { status: "running" })
    const restored = restoreGenerationBatch(batch)!
    expect(restored.results.map((result) => result.status)).toEqual(["completed", "interrupted", "interrupted"])
    expect(restored.results[0].saveStatus).toBe("uncertain")
    expect(restored.results[0].draft?.document).toEqual(batch.results[0].draft?.document)
    expect(batch.results[1].status).toBe("running")
    expect(batch.results[0].saveStatus).toBe("saving")
  })

  it("validates restored identities, kinds, inputs, states, and documents", () => {
    const valid = completedBatch(["slides"])
    const invalid: unknown[] = [null, {}, { ...valid, createdAt: Infinity }, { ...valid, input: { ...valid.input, rawText: 9 } },
      { ...valid, results: [valid.results[0], valid.results[0]] },
      { ...valid, results: [{ ...valid.results[0], id: "wrong-id" }] },
      { ...valid, results: [{ ...valid.results[0], kind: "unknown" }] },
      { ...valid, results: [{ ...valid.results[0], status: "completed", draft: null }] },
      { ...valid, results: [{ ...valid.results[0], draft: draft("course") }] },
      { ...valid, results: [{ ...valid.results[0], draft: { ...valid.results[0].draft, document: { kind: "slides" } } }] },
      { ...valid, results: [{ ...valid.results[0], saveStatus: "saved" }] }]
    for (const value of invalid) expect(restoreGenerationBatch(value)).toBeNull()
    const reversed = { ...completedBatch(), results: completedBatch().results.reverse() }
    expect(restoreGenerationBatch(reversed)?.results.map((result) => result.kind)).toEqual(["slides", "course", "report"])
  })

  it("removes compiled HTML from every stored output without changing live batch state", () => {
    const batch = completedBatch()
    const stripped = stripBatchArtifacts(batch)
    for (const result of stripped.results) expect(result.draft).not.toHaveProperty("artifactHtml")
    for (const result of batch.results) expect(result.draft?.artifactHtml).toContain("compiled fixture")
    expect(stripped.input).toEqual(batch.input)
    expect(stripped.results.map((result) => result.status)).toEqual(["completed", "completed", "completed"])
  })
})

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function withStorage(storage: MemoryStorage, run: () => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })
  try { run() }
  finally {
    if (prior) Object.defineProperty(globalThis, "window", prior)
    else Reflect.deleteProperty(globalThis, "window")
  }
}

function legacySnapshot(generated: GeneratedDraft | null = null): StoredGuestDraft {
  const now = Date.now()
  return { version: 2, input: { rawText: "  Legacy\r\n\r\nsource  ", files: [] }, selectedKind: "report", draft: generated, savedAt: now, expiresAt: now + 60_000 }
}

describe("guest batch persistence", () => {
  it("restores a legacy single draft as one completed result without pretending its example was a new AI request", () => {
    const example = { ...draft("course"), provider: "fallback", modelName: "heuristic" }
    const previous = legacySnapshot(example)
    withStorage({ getItem: () => JSON.stringify(previous), setItem: () => { throw new Error("No writes during load") }, removeItem: () => {} }, () => {
      const loaded = loadGuestDraft()!
      expect(loaded.selectedKinds).toEqual(["report"])
      expect(loaded.batch?.results).toHaveLength(1)
      expect(loaded.batch?.results[0].kind).toBe("course")
      expect(loaded.batch?.results[0].status).toBe("completed")
      expect(loaded.batch?.results[0].draft?.provider).toBe("fallback")
      expect(loaded.batch?.input.rawText).toBe(previous.input.rawText)
      expect(loaded.draft).not.toHaveProperty("artifactHtml")
    })
  })

  it("keeps an explicitly empty selection and falls back from malformed optional metadata", () => {
    const previous = legacySnapshot()
    let raw = JSON.stringify({ ...previous, selectedKinds: [], batch: { bad: true } })
    withStorage({ getItem: () => raw, setItem: () => {}, removeItem: () => {} }, () => {
      expect(loadGuestDraft()?.selectedKinds).toEqual([])
      expect(loadGuestDraft()?.batch).toBeNull()
      expect(loadGuestDraft()?.recoveryRequired).toBe(true)
      raw = JSON.stringify({ ...previous, selectedKinds: ["unknown"] })
      expect(loadGuestDraft()?.selectedKinds).toEqual(["report"])
    })
  })

  it("protects valid siblings in an unrestorable batch until an explicit new batch replaces it", () => {
    const batch = completedBatch(["slides", "course"])
    const broken = { ...batch, results: [batch.results[0], { ...batch.results[1], draft: { kind: "course", document: { kind: "course" } } }] }
    const previous = { ...legacySnapshot(), draft: null, batch: broken }
    const original = JSON.stringify(previous)
    let raw = original, writes = 0
    withStorage({ getItem: () => raw, setItem: (_key, value) => { writes++; raw = value }, removeItem: () => {} }, () => {
      const loaded = loadGuestDraft()!
      expect(loaded.recoveryRequired).toBe(true)
      expect(loaded.batch).toBeNull()
      expect(storeGuestDraft({ input: { rawText: "automatic state", files: [] }, selectedKind: "slides", draft: null })).toEqual({ stored: false, compacted: false })
      expect(raw).toBe(original)
      expect(writes).toBe(0)
      const replacement = createGenerationBatch(["report"], sourceInput(), "explicit-new-batch", 45)
      expect(storeGuestDraft({ input: { rawText: replacement.input.rawText, files: [] }, selectedKind: "report", draft: null, batch: replacement }).stored).toBe(true)
      expect(loadGuestDraft()?.recoveryRequired).toBe(false)
      expect(loadGuestDraft()?.batch?.id).toBe("explicit-new-batch")
      expect(JSON.parse(raw)).not.toHaveProperty("recoveryRequired")
    })
  })

  it("stores all completed outputs without compiled artifacts or a duplicate legacy draft", () => {
    const batch = completedBatch()
    const values = new Map<string, string>()
    withStorage({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: (key) => { values.delete(key) } }, () => {
      const outcome = storeGuestDraft({ input: { rawText: batch.input.rawText, files: [] }, selectedKind: "slides", selectedKinds: ["slides", "course", "report"], draft: batch.results[0].draft, batch })
      expect(outcome).toEqual({ stored: true, compacted: false })
      const stored = JSON.parse(values.get(STORAGE_KEY)!) as StoredGuestDraft
      expect(stored.version).toBe(2)
      expect(stored.draft).toBeNull()
      expect(stored.batch?.results).toHaveLength(3)
      for (const result of stored.batch!.results) expect(result.draft).not.toHaveProperty("artifactHtml")
      expect(loadGuestDraft()?.batch?.results.map((result) => result.status)).toEqual(["completed", "completed", "completed"])
      expect(batch.results[0].draft?.artifactHtml).toContain("compiled fixture")
    })
  })

  it("preserves generation and save state on disk, then requires explicit recovery after reload", () => {
    let batch = createGenerationBatch(["slides", "course"], sourceInput(), "in-flight", 42)
    batch = updateGenerationResult(batch, "in-flight:slides", { status: "completed", draft: draft("slides"), saveStatus: "saving" })
    batch = updateGenerationResult(batch, "in-flight:course", { status: "running" })
    let raw = ""
    withStorage({ getItem: () => raw, setItem: (_key, value) => { raw = value }, removeItem: () => {} }, () => {
      expect(storeGuestDraft({ input: { rawText: batch.input.rawText, files: [] }, selectedKind: "slides", draft: null, batch }).stored).toBe(true)
      expect(JSON.parse(raw).batch.results[1].status).toBe("running")
      expect(loadGuestDraft()?.batch?.results[1].status).toBe("interrupted")
      expect(loadGuestDraft()?.batch?.results[0].saveStatus).toBe("uncertain")
    })
  })

  it("compacts metadata and previews without clipping batch source files, retry input, or results", () => {
    const fileContent = "Authored file context ".repeat(700)
    let batch = createGenerationBatch(["slides", "course"], { ...sourceInput(), files: [{ name: "authored.txt", type: "text/plain", content: fileContent }] }, "large-source", 42)
    for (const result of batch.results) batch = updateGenerationResult(batch, result.id, { status: "completed", draft: draft(result.kind) })
    let raw = "", attempts = 0
    withStorage({ getItem: () => raw, setItem: (_key, value) => {
      attempts++
      const candidate = JSON.parse(value)
      if (candidate.input.textEntries || candidate.input.files.some((file: { previewDataUrl?: string }) => file.previewDataUrl)) throw new Error("QuotaExceededError")
      raw = value
    }, removeItem: () => {} }, () => {
      const outcome = storeGuestDraft({ input: { rawText: batch.input.rawText, textEntries: [batch.input.rawText], pendingText: "",
        files: [{ name: "authored.txt", type: "text/plain", content: fileContent, previewDataUrl: "data:image/png;base64,authored-preview" }] }, selectedKind: "slides", draft: null, batch })
      expect(outcome).toEqual({ stored: true, compacted: true })
      expect(attempts).toBe(3)
      const stored = JSON.parse(raw) as StoredGuestDraft
      expect(stored.input.files[0].content).toBe(fileContent)
      expect(stored.batch?.input.files[0].content).toBe(fileContent)
      expect(stored.input.rawText).toBe(batch.input.rawText)
      expect(stored.batch?.results.map((result) => result.draft?.document)).toEqual(batch.results.map((result) => result.draft?.document))
    })
  })

  it("reports failed replacement honestly and retains the previous snapshot for both batch and legacy saves", () => {
    const original = JSON.stringify(legacySnapshot(draft("report")))
    const values = new Map<string, string>([[STORAGE_KEY, original], ["unrelated-draft", "keep"]])
    const removed: string[] = []
    withStorage({ getItem: (key) => values.get(key) ?? null, setItem: () => { throw new Error("Storage unavailable") }, removeItem: (key) => { removed.push(key); values.delete(key) } }, () => {
      const batch = completedBatch()
      expect(storeGuestDraft({ input: { rawText: "new context", files: [] }, selectedKind: "slides", draft: null, batch })).toEqual({ stored: false, compacted: false })
      expect(storeGuestDraft({ input: { rawText: "new legacy context", files: [] }, selectedKind: "slides", draft: null })).toEqual({ stored: false, compacted: false })
      expect(values.get(STORAGE_KEY)).toBe(original)
      expect(values.get("unrelated-draft")).toBe("keep")
      expect(removed).toEqual([])
      expect(loadGuestDraft()?.input.rawText).toBe("  Legacy\r\n\r\nsource  ")
    })
  })
})
