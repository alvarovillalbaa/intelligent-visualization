import type { ImportedFile } from "@/lib/client/import-files"
import { clipContent } from "@/lib/client/import-files"
import {
  createGenerationBatch, normalizeGenerationKinds, restoreGeneratedDraft, restoreGenerationBatch,
  stripBatchArtifacts, updateGenerationResult, type GenerationBatch,
} from "@/lib/client/generation-batch"
import type { DeckSource } from "@/lib/types"
import type { VisualizationDocument, VisualizationKind } from "@/packages/domain/entities"

const STORAGE_KEY = "iv:guest-draft:v2"
const FOUR_HOURS_MS = 1000 * 60 * 60 * 4

export interface GeneratedDraft {
  kind: VisualizationKind
  document: VisualizationDocument
  deckSource?: DeckSource | null
  artifactHtml?: string | null
  provider: string
  modelName: string
  generatedAt: number
}

export interface StoredGuestDraft {
  version: 2
  input: {
    rawText: string
    textEntries?: string[]
    pendingText?: string
    files: ImportedFile[]
  }
  selectedKind: VisualizationKind
  selectedKinds?: VisualizationKind[]
  draft: GeneratedDraft | null
  batch?: GenerationBatch | null
  savedAt: number
  expiresAt: number
}

// Read-time recovery state is not part of the persisted v2 payload.
export type LoadedGuestDraft = StoredGuestDraft & { recoveryRequired?: boolean }

export function guestDraftExpiryMs() {
  return FOUR_HOURS_MS
}

export function loadGuestDraft(): LoadedGuestDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as StoredGuestDraft
    if (parsed.version !== 2 || !Number.isSafeInteger(parsed.savedAt) || parsed.savedAt < 0 || !Number.isSafeInteger(parsed.expiresAt) || parsed.expiresAt < 0) return null
    if (parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (!parsed.input || typeof parsed.input.rawText !== "string" || !Array.isArray(parsed.input.files)) return null
    if (parsed.input.files.some((file) => !file || typeof file.name !== "string" || typeof file.content !== "string" || typeof file.type !== "string")) return null
    if (!["slides", "course", "report"].includes(parsed.selectedKind)) return null
    const draft = parsed.draft ? restoreGeneratedDraft(parsed.draft) : null
    if (draft) delete draft.artifactHtml
    let batch = restoreGenerationBatch(parsed.batch)
    const recoveryRequired = parsed.batch !== undefined && parsed.batch !== null && !batch
    if (!batch && draft && !recoveryRequired) {
      const input = { inputKind: parsed.input.files.length ? "files" as const : "paste" as const,
        rawText: parsed.input.rawText, prompt: "", themeMode: "brand" as const,
        files: parsed.input.files.map(({ name, type, content }) => ({ name, type, content })) }
      batch = createGenerationBatch([draft.kind], input, `legacy-${parsed.savedAt}`, parsed.savedAt)
      batch = updateGenerationResult(batch, batch.results[0].id, { status: "completed", draft })
    }
    let selectedKinds = [parsed.selectedKind]
    if (Array.isArray(parsed.selectedKinds)) {
      try { selectedKinds = parsed.selectedKinds.length ? normalizeGenerationKinds(parsed.selectedKinds) : [] }
      catch { /* Keep the legacy selection when optional metadata is invalid. */ }
    }
    return { ...parsed, selectedKinds, draft, batch: batch ? stripBatchArtifacts(batch) : null, recoveryRequired }
  } catch {
    return null
  }
}

export function storeGuestDraft(snapshot: Omit<StoredGuestDraft, "version" | "savedAt" | "expiresAt">): { stored: boolean; compacted: boolean } {
  try { return persistGuestDraft(snapshot) }
  catch { return { stored: false, compacted: false } }
}

function persistGuestDraft(snapshot: Omit<StoredGuestDraft, "version" | "savedAt" | "expiresAt">): { stored: boolean; compacted: boolean } {
  const now = Date.now()
  let batch: GenerationBatch | null = null
  if (snapshot.batch !== undefined && snapshot.batch !== null) {
    // Validate without changing the live running/queued states in the stored snapshot.
    if (!restoreGenerationBatch(snapshot.batch)) return { stored: false, compacted: false }
    batch = stripBatchArtifacts(snapshot.batch)
  }
  const draft = snapshot.draft ? restoreGeneratedDraft(snapshot.draft) : null
  if (snapshot.draft && !draft) return { stored: false, compacted: false }
  if (draft) delete draft.artifactHtml
  const previousRaw = window.localStorage.getItem(STORAGE_KEY)
  if (previousRaw) {
    let previous: { version?: unknown; batch?: { id?: unknown } | null } | null = null
    try { previous = JSON.parse(previousRaw) } catch { /* Unparseable legacy input cannot supply a batch identity. */ }
    if (previous?.version === 2 && previous.batch != null && (!batch || batch.id === previous.batch.id) && !restoreGenerationBatch(previous.batch)) {
      // Preserve every original sibling until an explicit new batch or Start over.
      return { stored: false, compacted: false }
    }
  }
  const duplicatedDraft = draft && batch?.results.some((result) => result.draft && JSON.stringify(result.draft) === JSON.stringify(draft))
  const full: StoredGuestDraft = {
    version: 2,
    input: snapshot.input,
    selectedKind: snapshot.selectedKind,
    ...(snapshot.selectedKinds !== undefined ? { selectedKinds: snapshot.selectedKinds } : {}),
    // Never persist compiled HTML; it is recompiled on demand from deckSource.
    draft: duplicatedDraft ? null : draft,
    ...(snapshot.batch !== undefined ? { batch } : {}),
    savedAt: now,
    expiresAt: now + FOUR_HOURS_MS,
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full))
    return { stored: true, compacted: false }
  } catch {
    const withoutTextMetadata: StoredGuestDraft = {
      ...full,
      input: { rawText: full.input.rawText, files: full.input.files },
    }
    // Redundant entry metadata alone must never force existing files to be clipped.
    if (full.input.textEntries !== undefined || full.input.pendingText !== undefined) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutTextMetadata))
        return { stored: true, compacted: true }
      } catch {
        // Preserve the existing clipped-file fallback for tighter storage limits.
      }
    }
    const compact: StoredGuestDraft = {
      ...withoutTextMetadata,
      input: {
        // Keep canonical text; omit the duplicate entry metadata under quota pressure.
        rawText: full.input.rawText,
        files: full.input.files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          content: batch ? file.content : clipContent(file.content.slice(0, 4000)),
        })),
      },
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact))
      return { stored: true, compacted: true }
    } catch {
      // A failed replacement must not destroy a previously durable draft.
      return { stored: false, compacted: false }
    }
  }
}

export function clearGuestDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage unavailable
  }
}
