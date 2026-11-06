import { z } from "zod"

import type { SaveWorkspaceDraftInput, SaveWorkspaceDraftResult } from "@/packages/backend-contracts/workspace-drafts"
import { visualizationDocumentSchema } from "@/packages/domain/schemas"
import { canonicalSerialize } from "@/packages/domain/canonical"

const documentSchema = visualizationDocumentSchema.refine((document) => document.kind === "course" || document.kind === "report")
const inputSchema = z.object({ id: z.uuid(), requestId: z.uuid(), expectedRevision: z.number().int().min(0).max(2_147_483_646), document: documentSchema }).strict()
const resultSchema = z.object({
  status: z.enum(["saved", "conflict"]),
  draft: z.object({
    id: z.uuid(), workspaceSlug: z.string().min(1), kind: z.enum(["course", "report"]),
    title: z.string(), summary: z.string(), draftRevision: z.number().int().positive(), draftHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }), document: documentSchema,
  }),
  receipt: z.object({ requestId: z.uuid(), status: z.enum(["saved", "conflict"]), acceptedRevision: z.number().int().positive().nullable(), documentHash: z.string().regex(/^[a-f0-9]{64}$/) }),
})

export class WorkspaceDraftRequestError extends Error {
  constructor(message: string, public readonly uncertain: boolean) {
    super(message)
    this.name = "WorkspaceDraftRequestError"
  }
}

async function readResponse(response: Response, signal: AbortSignal) {
  if (!response.body) throw new Error("Missing draft response")
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true })
  let bytes = 0, complete = false, text = ""
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const part = await reader.read()
      signal.throwIfAborted()
      if (part.done) { complete = true; break }
      bytes += part.value.byteLength
      // The DTO repeats title/summary outside a document bounded to 2 MiB.
      if (bytes > 5 * 1024 * 1024) throw new Error("Draft response too large")
      text += decoder.decode(part.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    signal.removeEventListener("abort", abort)
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export async function saveWorkspaceDraft(workspaceSlug: string, input: SaveWorkspaceDraftInput, signal?: AbortSignal): Promise<SaveWorkspaceDraftResult> {
  const checked = inputSchema.safeParse(input)
  if (!checked.success || !workspaceSlug || workspaceSlug.length > 240) {
    throw new WorkspaceDraftRequestError("This draft could not be validated. Your edits are still available.", false)
  }
  const body = JSON.stringify(checked.data)
  if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024) {
    throw new WorkspaceDraftRequestError("This draft is too large to save here. Reduce its content; your edits are still available.", false)
  }
  let documentHash: string
  try {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSerialize(checked.data.document)))
    documentHash = Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("")
  } catch { throw new WorkspaceDraftRequestError("This browser could not prepare the save. Your edits are still available.", false) }
  const controller = new AbortController(), abort = () => controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(abort, 30_000)
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/visualizations`, {
      method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
    })
    if ([400, 401, 403, 404].includes(response.status)) {
      void response.body?.cancel().catch(() => {})
      throw new WorkspaceDraftRequestError(response.status === 401 ? "Sign in again before saving. Keep your local edits."
        : response.status === 403 ? "Your current session or workspace role cannot save this draft. Keep your local edits."
          : "This draft could not be saved in this workspace. Keep your local edits and reopen its saved copy.", false)
    }
    if (![200, 409].includes(response.status) || !(response.headers.get("content-type") ?? "").startsWith("application/json")) {
      void response.body?.cancel().catch(() => {})
      throw new Error("Unconfirmed draft response")
    }
    const parsed = resultSchema.safeParse(await readResponse(response, controller.signal))
    if (!parsed.success) throw new Error("Invalid draft acknowledgement")
    const result = parsed.data
    if (result.draft.id !== input.id || result.receipt.requestId !== input.requestId || result.draft.workspaceSlug !== workspaceSlug
      || result.draft.kind !== input.document.kind || result.draft.document.kind !== result.draft.kind
      || result.receipt.documentHash !== documentHash
      || result.status !== (response.status === 409 ? "conflict" : "saved")
      || (result.status === "saved" && (result.receipt.status !== "saved" || result.receipt.acceptedRevision === null
        || result.receipt.acceptedRevision !== input.expectedRevision + 1
        || result.draft.draftRevision < result.receipt.acceptedRevision || result.draft.draftHash !== result.receipt.documentHash))) {
      throw new Error("Mismatched draft acknowledgement")
    }
    return result as SaveWorkspaceDraftResult
  } catch (error) {
    if (error instanceof WorkspaceDraftRequestError) throw error
    throw new WorkspaceDraftRequestError("Saving could not be confirmed. Keep your edits and retry this same save before starting another.", true)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}
