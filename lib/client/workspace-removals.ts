import { z } from "zod"
import type { RemoveWorkspaceDraftInput, WorkspaceRemovalReview, WorkspaceRemovalResult } from "@/packages/backend-contracts/workspace-removals"

const uuid = z.uuid().refine((value) => value === value.toLowerCase())
const tuple = { draftRevision: z.number().int().min(1).max(2_147_483_646), draftHash: z.string().regex(/^[a-f0-9]{64}$/), publishedVersionId: uuid.nullable() }
const active = z.enum(["draft", "preview", "published", "archived"])
const expected = z.object({ ...tuple, status: active }).strict()
const reviewSchema = z.object({ ...tuple, status: active, id: uuid, kind: z.enum(["course", "report"]), title: z.string().max(240) }).strict()
const resultSchema = z.object({ status: z.enum(["removed", "conflict"]),
  current: z.object({ ...tuple, id: uuid, status: z.enum(["draft", "preview", "published", "archived", "removed"]) }).strict(),
  receipt: z.object({ requestId: uuid, status: z.enum(["removed", "conflict"]), removedAt: z.iso.datetime({ offset: true }).nullable() }).strict(),
}).strict()
export class WorkspaceRemovalRequestError extends Error {
  constructor(message: string, public readonly uncertain: boolean) { super(message); this.name = "WorkspaceRemovalRequestError" }
}
function path(workspaceSlug: string, id: string) {
  if (!uuid.safeParse(id).success || !workspaceSlug || workspaceSlug.length > 240 || workspaceSlug.trim() !== workspaceSlug
    || [".", ".."].includes(workspaceSlug) || /[/\\?#\u0000-\u001f\u007f]/.test(workspaceSlug)) throw new WorkspaceRemovalRequestError("Reload this workspace before continuing.", false)
  return `/api/workspaces/${encodeURIComponent(workspaceSlug)}/visualizations/${id}/removal`
}
async function request(url: string, body?: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30_000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, complete = false
  const cancel = () => { void reader?.cancel().catch(() => {}) }
  controller.signal.addEventListener("abort", cancel, { once: true })
  try {
    const response = await fetch(url, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body }) })
    if ([400, 401, 403, 404].includes(response.status)) {
      void response.body?.cancel().catch(() => {})
      throw new WorkspaceRemovalRequestError(response.status === 401 ? "Sign in again before continuing." : response.status === 403
        ? "Your current session or role cannot perform this request." : "This saved item or request is unavailable. Reload the workspace.", false)
    }
    if (!(body === undefined ? response.status === 200 : [200, 409].includes(response.status)) || !response.body
      || !(response.headers.get("content-type") ?? "").startsWith("application/json") || !(response.headers.get("cache-control") ?? "").includes("no-store")) {
      void response.body?.cancel().catch(() => {})
      throw new Error("Unconfirmed response")
    }
    reader = response.body.getReader()
    const decoder = new TextDecoder("utf-8", { fatal: true }); let text = "", bytes = 0
    while (true) {
      controller.signal.throwIfAborted()
      const part = await reader.read()
      controller.signal.throwIfAborted()
      if (part.done) { complete = true; break }
      bytes += part.value.byteLength
      if (bytes > 16 * 1024) throw new Error("Oversized response")
      text += decoder.decode(part.value, { stream: true })
    }
    return { value: JSON.parse(text + decoder.decode()) as unknown, status: response.status }
  } catch (error) {
    if (error instanceof WorkspaceRemovalRequestError) throw error
    throw new WorkspaceRemovalRequestError(body === undefined ? "The saved item could not be reviewed. Try loading it again."
      : "Removal could not be confirmed. Keep this tab open and retry the same removal.", body !== undefined)
  } finally {
    clearTimeout(timer); controller.signal.removeEventListener("abort", cancel)
    if (!complete) cancel()
    reader?.releaseLock()
  }
}
export async function getWorkspaceRemovalReview(workspaceSlug: string, id: string, kind: "course" | "report"): Promise<WorkspaceRemovalReview> {
  const { value } = await request(path(workspaceSlug, id)), parsed = reviewSchema.safeParse(value)
  if (!parsed.success || parsed.data.id !== id || parsed.data.kind !== kind) throw new WorkspaceRemovalRequestError("The saved item could not be verified. Reload the workspace.", false)
  return parsed.data
}
export async function removeWorkspaceDraft(workspaceSlug: string, input: RemoveWorkspaceDraftInput): Promise<WorkspaceRemovalResult> {
  const checked = z.object({ id: uuid, requestId: uuid, expected }).strict().safeParse(input)
  if (!checked.success) throw new WorkspaceRemovalRequestError("Review the saved item again before removing it.", false)
  const captured = checked.data
  const { value, status } = await request(path(workspaceSlug, captured.id), JSON.stringify({ requestId: captured.requestId, expected: captured.expected }))
  const parsed = resultSchema.safeParse(value)
  if (!parsed.success || parsed.data.current.id !== captured.id || parsed.data.receipt.requestId !== captured.requestId
    || parsed.data.status !== (status === 200 ? "removed" : "conflict")
    || (parsed.data.receipt.status === "removed" ? parsed.data.receipt.removedAt === null : parsed.data.receipt.removedAt !== null)
    || parsed.data.status === "removed" && (parsed.data.current.status !== "removed" || parsed.data.receipt.status !== "removed"
      || parsed.data.current.draftRevision !== captured.expected.draftRevision || parsed.data.current.draftHash !== captured.expected.draftHash
      || parsed.data.current.publishedVersionId !== captured.expected.publishedVersionId)) {
    throw new WorkspaceRemovalRequestError("The removal acknowledgement could not be verified. Retry the same removal.", true)
  }
  return parsed.data
}
