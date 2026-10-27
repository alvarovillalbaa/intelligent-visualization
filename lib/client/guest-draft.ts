import type { ImportedFile } from "@/lib/client/import-files"
import { clipContent } from "@/lib/client/import-files"
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
  draft: GeneratedDraft | null
  savedAt: number
  expiresAt: number
}

export function guestDraftExpiryMs() {
  return FOUR_HOURS_MS
}

export function loadGuestDraft(): StoredGuestDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as StoredGuestDraft
    if (parsed.version !== 2 || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function storeGuestDraft(snapshot: Omit<StoredGuestDraft, "version" | "savedAt" | "expiresAt">) {
  const now = Date.now()
  const full: StoredGuestDraft = {
    version: 2,
    ...snapshot,
    // Never persist compiled HTML; it is recompiled on demand from deckSource.
    draft: snapshot.draft ? { ...snapshot.draft, artifactHtml: undefined } : null,
    savedAt: now,
    expiresAt: now + FOUR_HOURS_MS,
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full))
  } catch {
    const withoutTextMetadata: StoredGuestDraft = {
      ...full,
      input: { rawText: full.input.rawText, files: full.input.files },
    }
    // Redundant entry metadata alone must never force existing files to be clipped.
    if (full.input.textEntries !== undefined || full.input.pendingText !== undefined) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutTextMetadata))
        return
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
          content: clipContent(file.content.slice(0, 4000)),
        })),
      },
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact))
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
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
