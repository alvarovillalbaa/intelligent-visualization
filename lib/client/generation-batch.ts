import { z } from "zod"

import { deckSourceSchema, generationInputSchema } from "@/lib/ai/schema"
import type { GeneratedDraft } from "@/lib/client/guest-draft"
import type { GenerationInput } from "@/lib/types"
import type { VisualizationKind } from "@/packages/domain/entities"
import type { SaveWorkspaceDraftInput, WorkspaceDraftDocument } from "@/packages/backend-contracts/workspace-drafts"
import { visualizationDocumentSchema } from "@/packages/domain/schemas"

export type GenerationResult = {
  id: string
  kind: VisualizationKind
  status: "queued" | "running" | "completed" | "failed" | "interrupted"
  draft: GeneratedDraft | null
  error: string | null
  saveStatus: "idle" | "saving" | "saved" | "uncertain" | "failed"
  savedDeckId?: string
  workspaceSaveStatus?: "idle" | "saving" | "saved" | "uncertain" | "failed" | "conflict"
  workspaceDraftId?: string
  workspaceSaveIntent?: SaveWorkspaceDraftInput
  workspaceSaveError?: string | null
  savedVisualizationId?: string
  savedVisualizationRevision?: number
  savedVisualizationHash?: string
  workspaceSavedSnapshot?: WorkspaceDraftDocument
}

export type GenerationBatch = {
  id: string
  createdAt: number
  input: GenerationInput
  results: GenerationResult[]
}

export type GenerationResultPatch = Partial<Omit<GenerationResult, "id" | "kind">>

const KINDS: VisualizationKind[] = ["slides", "course", "report"]
const kindSchema = z.enum(["slides", "course", "report"])
const idSchema = z.string().refine((value) => value.trim().length > 0)
const timestampSchema = z.number().refine((value) => Number.isSafeInteger(value) && value >= 0)

// Stored legacy decks are not constrained to the AI generation prompt's 4–8 slides
// or block counts. Validate their shape without discarding shorter existing decks.
const legacyBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("paragraph"), text: z.string() }),
  z.object({ kind: z.literal("bullets"), items: z.array(z.string()) }),
  z.object({ kind: z.literal("stats"), items: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() })) }),
  z.object({ kind: z.literal("quote"), quote: z.string(), byline: z.string() }),
  z.object({ kind: z.literal("timeline"), items: z.array(z.object({ label: z.string(), detail: z.string() })) }),
  z.object({ kind: z.literal("code"), language: z.string(), code: z.string() }),
  z.object({ kind: z.literal("callout"), label: z.string(), value: z.string() }),
])

const storedDeckSourceSchema = deckSourceSchema.omit({ slides: true, poll: true }).extend({
  poll: z.object({ question: z.string(), options: z.array(z.string()) }),
  slides: z.array(z.object({
    id: z.string(), kicker: z.string(), title: z.string(), summary: z.string(),
    layout: z.enum(["hero", "split", "stats", "quote", "timeline", "cta"]),
    blocks: z.array(legacyBlockSchema), notes: z.string(),
  })).min(1),
})

const draftSchema = z.object({
  kind: kindSchema,
  document: visualizationDocumentSchema,
  deckSource: storedDeckSourceSchema.nullable().optional(),
  artifactHtml: z.string().nullable().optional(),
  provider: z.string().min(1),
  modelName: z.string().min(1),
  generatedAt: timestampSchema,
})

const resultSchema = z.object({
  id: idSchema,
  kind: kindSchema,
  status: z.enum(["queued", "running", "completed", "failed", "interrupted"]),
  draft: draftSchema.nullable(),
  error: z.string().nullable(),
  saveStatus: z.enum(["idle", "saving", "saved", "uncertain", "failed"]),
  savedDeckId: idSchema.optional(),
  workspaceSaveStatus: z.enum(["idle", "saving", "saved", "uncertain", "failed", "conflict"]).optional(),
  workspaceDraftId: z.string().uuid().optional(),
  workspaceSaveIntent: z.object({
    id: z.string().uuid(), requestId: z.string().uuid(), expectedRevision: z.number().int().min(0).max(2_147_483_646),
    document: visualizationDocumentSchema,
  }).optional(),
  workspaceSaveError: z.string().nullable().optional(),
  savedVisualizationId: z.string().uuid().optional(),
  savedVisualizationRevision: z.number().int().positive().max(2_147_483_647).optional(),
  savedVisualizationHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  workspaceSavedSnapshot: visualizationDocumentSchema.optional(),
})

const batchSchema = z.object({
  id: idSchema,
  createdAt: timestampSchema,
  input: generationInputSchema,
  results: z.array(resultSchema).min(1).max(3),
})

function validDraft(draft: GeneratedDraft): boolean {
  return draft.kind === draft.document.kind && (draft.kind === "slides" || draft.deckSource == null)
}

export function workspaceDraftMatchesSaved(result: GenerationResult): boolean {
  return Boolean(result.draft && result.workspaceSavedSnapshot
    && JSON.stringify(result.draft.document) === JSON.stringify(result.workspaceSavedSnapshot))
}

function validWorkspaceSave(result: GenerationResult): boolean {
  const fields = [result.workspaceSaveStatus, result.workspaceDraftId, result.workspaceSaveIntent, result.workspaceSaveError,
    result.savedVisualizationId, result.savedVisualizationRevision, result.savedVisualizationHash, result.workspaceSavedSnapshot]
  if (result.kind === "slides") return fields.every((value) => value === undefined)
  if (result.workspaceSaveIntent && (result.workspaceSaveIntent.document.kind !== result.kind
    || result.workspaceSaveIntent.id !== result.workspaceDraftId
    || result.workspaceSaveIntent.expectedRevision !== (result.savedVisualizationRevision ?? 0))) return false
  if (result.workspaceSavedSnapshot && result.workspaceSavedSnapshot.kind !== result.kind) return false
  if (result.savedVisualizationId && result.savedVisualizationId !== result.workspaceDraftId) return false
  if (result.savedVisualizationId && (!result.savedVisualizationRevision || !result.savedVisualizationHash)) return false
  if ((result.savedVisualizationRevision !== undefined || result.savedVisualizationHash !== undefined || result.workspaceSavedSnapshot)
    && !result.savedVisualizationId) return false
  if ((result.workspaceSaveStatus === "saving" || result.workspaceSaveStatus === "uncertain") && !result.workspaceSaveIntent) return false
  if (result.workspaceSaveStatus === "conflict" && (!result.savedVisualizationId || result.workspaceSaveIntent)) return false
  if (result.workspaceSaveStatus === "saved" && (!result.savedVisualizationId || !result.savedVisualizationRevision
    || !result.savedVisualizationHash || !workspaceDraftMatchesSaved(result))) return false
  return true
}

export function restoreGeneratedDraft(value: unknown): GeneratedDraft | null {
  try {
    const parsed = draftSchema.safeParse(value)
    if (!parsed.success) return null
    const draft = parsed.data as GeneratedDraft
    return validDraft(draft) ? structuredClone(draft) : null
  } catch { return null }
}

export function normalizeGenerationKinds(kinds: readonly VisualizationKind[]): VisualizationKind[] {
  if (!Array.isArray(kinds) || !kinds.length || !Array.from(kinds).every((kind) => KINDS.includes(kind))) {
    throw new Error("Choose at least one of Slides, Course, or Report.")
  }
  return KINDS.filter((kind) => kinds.includes(kind))
}

export function createGenerationBatch(
  kinds: VisualizationKind[], input: GenerationInput, id: string, createdAt: number,
): GenerationBatch {
  const selected = normalizeGenerationKinds(kinds)
  if (!idSchema.safeParse(id).success || !timestampSchema.safeParse(createdAt).success || !generationInputSchema.safeParse(input).success) {
    throw new Error("A generation batch needs a valid identity, time, and source input.")
  }
  return {
    id, createdAt, input: structuredClone(input),
    results: selected.map((kind) => ({ id: `${id}:${kind}`, kind, status: "queued", draft: null, error: null, saveStatus: "idle" })),
  }
}

export function updateGenerationResult(
  batch: GenerationBatch, id: string, patch: GenerationResultPatch,
): GenerationBatch {
  const current = batch.results.find((result) => result.id === id)
  if (!current) return batch
  const next = { ...current, ...structuredClone(patch), id: current.id, kind: current.kind }
  const parsed = resultSchema.safeParse(next)
  if (!parsed.success || !validWorkspaceSave(next) || (next.draft && (!validDraft(next.draft) || next.draft.kind !== current.kind)) || (next.status === "completed" && !next.draft) || (next.saveStatus === "saved" && !next.savedDeckId)) {
    throw new Error("Invalid generation result update.")
  }
  return { ...batch, results: batch.results.map((result) => result.id === id ? parsed.data as GenerationResult : result) }
}

export function restoreGenerationBatch(value: unknown): GenerationBatch | null {
  try {
    const parsed = batchSchema.safeParse(value)
    if (!parsed.success) return null
    const batch = parsed.data as GenerationBatch
    const kinds = batch.results.map((result) => result.kind)
    if (new Set(kinds).size !== kinds.length) return null
    for (const result of batch.results) {
      if (!validWorkspaceSave(result) || result.id !== `${batch.id}:${result.kind}` || (result.draft && (!validDraft(result.draft) || result.draft.kind !== result.kind)) || (result.status === "completed" && !result.draft) || (result.saveStatus === "saved" && !result.savedDeckId)) return null
    }
    return structuredClone({
      ...batch,
      results: KINDS.flatMap((kind) => {
        const result = batch.results.find((candidate) => candidate.kind === kind)
        return result ? [{ ...result,
          status: result.status === "queued" || result.status === "running" ? "interrupted" as const : result.status,
          saveStatus: result.saveStatus === "saving" ? "uncertain" as const : result.saveStatus,
          ...(result.workspaceSaveStatus === "saving" ? { workspaceSaveStatus: "uncertain" as const } : {}),
        }] : []
      }),
    })
  } catch { return null }
}

export function stripBatchArtifacts(batch: GenerationBatch): GenerationBatch {
  const copy = structuredClone(batch)
  for (const result of copy.results) if (result.draft) delete result.draft.artifactHtml
  return copy
}
