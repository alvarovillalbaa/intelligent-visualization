import { z } from "zod"

import type { WorkspaceDraftKind } from "@/packages/backend-contracts/workspace-drafts"
import type { PublishWorkspaceDraftInput, WorkspacePublicationResult, WorkspacePublicationState } from "@/packages/backend-contracts/workspace-publications"
import { canonicalSerialize } from "@/packages/domain/canonical"

const uuid = z.uuid().refine((value) => value === value.toLowerCase())
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const versionSchema = z.object({
  publicId: z.string().regex(/^(course|report)_[a-f0-9]{32}$/), versionId: uuid,
  sourceRevision: z.number().int().positive().max(2_147_483_647), documentHash: hash, artifactHash: hash,
  createdAt: z.iso.datetime({ offset: true }), title: z.string(), publicUrl: z.string(), versionUrl: z.string(),
}).strict()
const stateSchema = z.object({
  id: uuid, workspaceSlug: z.string(), kind: z.enum(["course", "report"]),
  draftRevision: z.number().int().positive().max(2_147_483_647), draftHash: hash, current: versionSchema.nullable(),
}).strict()
const resultSchema = z.object({
  status: z.enum(["published", "conflict"]), state: stateSchema,
  receipt: z.object({ requestId: uuid, versionId: uuid, status: z.enum(["published", "conflict"]),
    acceptedRevision: z.number().int().positive().max(2_147_483_647).nullable(), documentHash: hash, publication: versionSchema.nullable() }).strict(),
}).strict()
const inputSchema = z.object({ id: uuid, requestId: uuid, versionId: uuid,
  expectedRevision: z.number().int().min(1).max(2_147_483_646), expectedDraftHash: hash }).strict()

export class WorkspacePublicationRequestError extends Error {
  constructor(message: string, public readonly uncertain: boolean) {
    super(message)
    this.name = "WorkspacePublicationRequestError"
  }
}

function path(workspaceSlug: string, id: string, kind: WorkspaceDraftKind) {
  if (!uuid.safeParse(id).success || !["course", "report"].includes(kind) || !workspaceSlug || workspaceSlug.length > 240
    || workspaceSlug.trim() !== workspaceSlug || [".", ".."].includes(workspaceSlug) || /[/\\?#\u0000-\u001f\u007f]/.test(workspaceSlug)) {
    throw new WorkspacePublicationRequestError("The publication target is invalid. Reload the saved draft.", false)
  }
  return `/api/workspaces/${encodeURIComponent(workspaceSlug)}/visualizations/${id}/publications`
}

function validVersion(version: z.infer<typeof versionSchema>, kind: WorkspaceDraftKind) {
  return version.publicId.startsWith(`${kind}_`) && version.publicUrl === `/v/${version.publicId}`
    && version.versionUrl === `/v/${version.publicId}/${version.versionId}`
}

function validState(state: WorkspacePublicationState, workspaceSlug: string, id: string, kind: WorkspaceDraftKind) {
  return state.id === id && state.workspaceSlug === workspaceSlug && state.kind === kind
    && (!state.current || validVersion(state.current, kind) && state.current.sourceRevision <= state.draftRevision
      && (state.current.sourceRevision !== state.draftRevision || state.current.documentHash === state.draftHash))
}

async function readJson(response: Response, signal: AbortSignal) {
  if (!response.body) throw new Error("Missing publication response")
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true })
  let bytes = 0, text = "", complete = false
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const part = await reader.read()
      signal.throwIfAborted()
      if (part.done) { complete = true; break }
      bytes += part.value.byteLength
      if (bytes > 128 * 1024) throw new Error("Publication response too large")
      text += decoder.decode(part.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    signal.removeEventListener("abort", abort)
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function request(url: string, body: string | undefined, signal?: AbortSignal) {
  if (signal?.aborted) throw new WorkspacePublicationRequestError("The publication request was cancelled before sending.", false)
  const controller = new AbortController(), abort = () => controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, 30_000)
  try {
    const response = await fetch(url, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body }), signal: controller.signal })
    if ([400, 401, 403, 404].includes(response.status)) {
      void response.body?.cancel().catch(() => {})
      throw new WorkspacePublicationRequestError(response.status === 401 ? "Sign in again to check or publish this saved draft."
        : response.status === 403 ? "Your current session or workspace role cannot perform this publication request."
          : "This publication request was refused. Reload the saved draft before continuing.", false)
    }
    if (!(body === undefined ? response.status === 200 : [200, 409].includes(response.status))
      || !(response.headers.get("content-type") ?? "").startsWith("application/json")
      || !(response.headers.get("cache-control") ?? "").includes("no-store")) {
      void response.body?.cancel().catch(() => {})
      throw new Error("Unconfirmed publication response")
    }
    return { value: await readJson(response, controller.signal), status: response.status }
  } catch (cause) {
    if (cause instanceof WorkspacePublicationRequestError) throw cause
    throw new WorkspacePublicationRequestError(body === undefined ? "Publication status could not be loaded. A version may already be public."
      : "Publication could not be confirmed. Keep this tab open and retry the same publication.", body !== undefined)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
}

export async function getWorkspacePublicationState(workspaceSlug: string, id: string, kind: WorkspaceDraftKind, signal?: AbortSignal): Promise<WorkspacePublicationState> {
  const { value } = await request(path(workspaceSlug, id, kind), undefined, signal)
  const parsed = stateSchema.safeParse(value)
  if (!parsed.success || !validState(parsed.data, workspaceSlug, id, kind)) {
    throw new WorkspacePublicationRequestError("Publication status could not be verified. A version may already be public.", false)
  }
  return parsed.data
}

export async function publishWorkspaceDraft(workspaceSlug: string, input: PublishWorkspaceDraftInput, kind: WorkspaceDraftKind, signal?: AbortSignal): Promise<WorkspacePublicationResult> {
  const checked = inputSchema.safeParse(input)
  if (!checked.success) throw new WorkspacePublicationRequestError("The saved revision could not be validated for publication.", false)
  const captured = checked.data
  const url = path(workspaceSlug, captured.id, kind)
  const wire = { requestId: captured.requestId, versionId: captured.versionId,
    expectedRevision: captured.expectedRevision, expectedDraftHash: captured.expectedDraftHash }
  const { value, status } = await request(url, JSON.stringify(wire), signal)
  const parsed = resultSchema.safeParse(value)
  if (!parsed.success) throw new WorkspacePublicationRequestError("The publication acknowledgement could not be verified. Retry the same publication.", true)
  const result = parsed.data, receipt = result.receipt, original = receipt.publication
  const validOriginal = receipt.status === "published"
    ? original !== null && validVersion(original, kind) && original.versionId === captured.versionId
      && original.sourceRevision === captured.expectedRevision && receipt.acceptedRevision === captured.expectedRevision
      && original.documentHash === captured.expectedDraftHash && original.sourceRevision <= result.state.draftRevision
      && (!result.state.current || result.state.current.publicId === original.publicId)
    : original === null && receipt.acceptedRevision === null
  if (!validState(result.state, workspaceSlug, captured.id, kind) || receipt.requestId !== captured.requestId
    || receipt.versionId !== captured.versionId || receipt.documentHash !== captured.expectedDraftHash || !validOriginal
    || result.status !== (status === 409 ? "conflict" : "published")
    || result.status === "published" && (receipt.status !== "published" || result.state.draftRevision !== captured.expectedRevision
      || result.state.draftHash !== captured.expectedDraftHash || canonicalSerialize(result.state.current) !== canonicalSerialize(original))) {
    throw new WorkspacePublicationRequestError("The publication acknowledgement does not match this saved revision. Retry the same publication.", true)
  }
  return result
}
