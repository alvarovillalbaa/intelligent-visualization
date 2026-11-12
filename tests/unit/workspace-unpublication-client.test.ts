// T2: authored transport responses only; no UI state substitute, server or database.
import { afterEach, describe, expect, it, vi } from "vitest"
import { unpublishWorkspaceDraft } from "@/lib/client/workspace-publications"
import type { WorkspaceDraftKind } from "@/packages/backend-contracts/workspace-drafts"
import type { UnpublishWorkspaceDraftInput, WorkspacePublicationState, WorkspaceUnpublicationResult } from "@/packages/backend-contracts/workspace-publications"

const slug = "core-growth", id = "0dcbaf65-40c2-4fa0-bf01-63ad5629cfea"
const requestId = "b1a0d811-bd61-45c3-8994-fc2b43d8f757", versionId = "315df8aa-4180-43a0-8104-5d2277897087"
const laterVersionId = "30b9ec1a-df92-4557-bb18-7cf766c5ab21", otherId = "2da62229-6a4f-4001-ab66-6f26a85dbf05"
const hash = "a".repeat(64), revokedAt = "2026-11-06T12:00:00.000Z"
const endpoint = `/api/workspaces/${slug}/visualizations/${id}/publications/unpublish`
function input(): UnpublishWorkspaceDraftInput { return { id, requestId, expectedCurrentVersionId: versionId } }
function state(kind: WorkspaceDraftKind = "course"): WorkspacePublicationState {
  return { id, workspaceSlug: slug, kind, draftRevision: 5, draftHash: hash, current: null }
}
function result(kind: WorkspaceDraftKind = "course"): WorkspaceUnpublicationResult {
  return { status: "unpublished", state: state(kind), receipt: { requestId, expectedCurrentVersionId: versionId, status: "unpublished", revokedAt } }
}
function current(kind: WorkspaceDraftKind = "course") {
  const publicId = `${kind}_${"1".repeat(32)}`
  return { publicId, versionId: laterVersionId, sourceRevision: 4, documentHash: "b".repeat(64), artifactHash: "c".repeat(64),
    createdAt: revokedAt, title: "Authored later publication", publicUrl: `/v/${publicId}`, versionUrl: `/v/${publicId}/${laterVersionId}` }
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } })
}

describe("workspace unpublication client protocol", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it("sends only a detached expected-public-version intent for both kinds without sending a draft or origin override", async () => {
    for (const kind of ["course", "report"] as const) {
      const value = input(), fetch = vi.fn((_url: string, init: RequestInit) => {
        expect(JSON.parse(init.body as string)).toEqual({ requestId, expectedCurrentVersionId: versionId })
        expect(init.headers).toEqual({ "Content-Type": "application/json" })
        value.id = otherId; value.requestId = otherId; value.expectedCurrentVersionId = laterVersionId
        return Promise.resolve(response(result(kind)))
      })
      vi.stubGlobal("fetch", fetch)
      expect(await unpublishWorkspaceDraft(slug, value, kind)).toEqual(result(kind))
      expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) }))
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  it("requires exact target receipt state and revocation metadata before acknowledging unpublication", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const bad: unknown[] = [
      { ...result(), state: { ...state(), id: otherId } },
      { ...result(), state: { ...state(), workspaceSlug: "other-workspace" } },
      { ...result(), state: { ...state(), kind: "report" } },
      { ...result(), receipt: { ...result().receipt, requestId: otherId } },
      { ...result(), receipt: { ...result().receipt, expectedCurrentVersionId: laterVersionId } },
      { ...result(), receipt: { ...result().receipt, revokedAt: null } },
      { ...result(), receipt: { ...result().receipt, revokedAt: "not-a-time" } },
      { ...result(), state: { ...state(), current: current() } },
      { ...result(), receipt: { ...result().receipt, status: "conflict" } },
      { ...result(), actor: { role: "admin" } },
    ]
    for (const value of bad) {
      fetch.mockResolvedValueOnce(response(value))
      await expect(unpublishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    }
    fetch.mockResolvedValueOnce(response(result(), 409))
    await expect(unpublishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
  })

  it("keeps an original revoked receipt distinct from a later publication or a later unpublished state", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const replay: WorkspaceUnpublicationResult = { ...result(), status: "conflict", state: { ...state(), current: current() } }
    fetch.mockResolvedValueOnce(response(replay, 409))
    const received = await unpublishWorkspaceDraft(slug, input(), "course")
    expect(received.receipt).toEqual(result().receipt)
    expect(received.state.current?.versionId).toBe(laterVersionId)
    fetch.mockResolvedValueOnce(response({ ...replay, state: state() }, 409))
    expect((await unpublishWorkspaceDraft(slug, input(), "course")).status).toBe("conflict")
    const refusal = { ...replay, receipt: { ...replay.receipt, status: "conflict", revokedAt: null } }
    fetch.mockResolvedValueOnce(response(refusal, 409))
    expect((await unpublishWorkspaceDraft(slug, input(), "course")).receipt.revokedAt).toBeNull()
    for (const active of [
      { ...current(), versionId, versionUrl: `/v/${current().publicId}/${versionId}` },
      { ...current(), publicUrl: "https://outside.invalid/public" },
      { ...current(), versionUrl: `${current().versionUrl}?token=unexpected` },
      { ...current(), publicId: `report_${"1".repeat(32)}` },
    ]) {
      fetch.mockResolvedValueOnce(response({ ...replay, state: { ...state(), current: active } }, 409))
      await expect(unpublishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    }
  })

  it("leaves caller-owned retry intent unchanged across an unknown result and later definite refusal without automatic retries", async () => {
    const value = input(), original = structuredClone(value), bodies: string[] = [], fetch = vi.fn((_url: string, init: RequestInit) => {
      bodies.push(init.body as string)
      if (bodies.length === 1) return Promise.reject(new Error("authored-private-server-secret"))
      if (bodies.length === 2) return Promise.resolve(response({ error: "authored-private-server-secret" }, 403))
      return Promise.resolve(response(result()))
    })
    vi.stubGlobal("fetch", fetch)
    await expect(unpublishWorkspaceDraft(slug, value, "course")).rejects.toMatchObject({ uncertain: true,
      message: "Unpublish could not be confirmed. Keep this tab open and retry the same unpublish." })
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(unpublishWorkspaceDraft(slug, value, "course")).rejects.toMatchObject({ uncertain: false })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(await unpublishWorkspaceDraft(slug, value, "course")).toEqual(result())
    expect(new Set(bodies).size).toBe(1)
    expect(value).toEqual(original)
    for (const status of [400, 401, 404]) {
      fetch.mockResolvedValueOnce(response({}, status))
      await expect(unpublishWorkspaceDraft(slug, value, "course")).rejects.toMatchObject({ uncertain: false })
    }
    fetch.mockResolvedValueOnce(response({}, 503))
    await expect(unpublishWorkspaceDraft(slug, value, "course")).rejects.toMatchObject({ uncertain: true })
  })

  it("bounds unpublish responses and UTF8 decoding and aborts the thirty-second request", async () => {
    const cancel = vi.fn(), fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    fetch.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(128 * 1024 + 1)) }, cancel }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } }))
    await expect(unpublishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    expect(cancel).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } }))
    await expect(unpublishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    vi.useFakeTimers()
    const observed: { signal?: AbortSignal } = {}
    fetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      observed.signal = init.signal as AbortSignal
      observed.signal.addEventListener("abort", () => reject(new DOMException("Authored abort", "AbortError")), { once: true })
    }))
    const rejection = expect(unpublishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    await vi.advanceTimersByTimeAsync(30_001)
    await rejection
    expect(observed.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects actor draft and malformed expected-version fields before sending and honors pre-cancellation", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const bad = [
      { ...input(), id: "not-an-id" }, { ...input(), requestId: requestId.toUpperCase() },
      { ...input(), expectedCurrentVersionId: "not-a-version" }, { ...input(), actor: { role: "admin" } },
      { ...input(), expectedRevision: 5 }, { ...input(), document: {} },
    ]
    for (const value of bad) await expect(unpublishWorkspaceDraft(slug, value, "course")).rejects.toMatchObject({ uncertain: false })
    for (const target of ["..", "other/workspace", "core-growth?override=1"]) await expect(unpublishWorkspaceDraft(target, input(), "course")).rejects.toMatchObject({ uncertain: false })
    const controller = new AbortController(); controller.abort()
    await expect(unpublishWorkspaceDraft(slug, input(), "course", controller.signal)).rejects.toMatchObject({ uncertain: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})
