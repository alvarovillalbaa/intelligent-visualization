// T2: authored protocol responses only; no application server, database or storage.
import { afterEach, describe, expect, it, vi } from "vitest"
import { getWorkspacePublicationState, publishWorkspaceDraft } from "@/lib/client/workspace-publications"
import type { PublishWorkspaceDraftInput, WorkspacePublicationResult, WorkspacePublicationState, WorkspacePublishedVersion } from "@/packages/backend-contracts/workspace-publications"

const slug = "core-growth", id = "0dcbaf65-40c2-4fa0-bf01-63ad5629cfea"
const requestId = "b1a0d811-bd61-45c3-8994-fc2b43d8f757", versionId = "315df8aa-4180-43a0-8104-5d2277897087"
const nextVersion = "30b9ec1a-df92-4557-bb18-7cf766c5ab21", otherId = "2da62229-6a4f-4001-ab66-6f26a85dbf05"
const publicId = `course_${"1".repeat(32)}`, hash = "a".repeat(64), nextHash = "b".repeat(64)
const endpoint = `/api/workspaces/${slug}/visualizations/${id}/publications`
function input(): PublishWorkspaceDraftInput { return { id, requestId, versionId, expectedRevision: 3, expectedDraftHash: hash } }
function version(): WorkspacePublishedVersion {
  return { publicId, versionId, sourceRevision: 3, documentHash: hash, artifactHash: "c".repeat(64),
    createdAt: "2026-11-06T10:00:00.000Z", title: "Authored publication", publicUrl: `/v/${publicId}`, versionUrl: `/v/${publicId}/${versionId}` }
}
function state(): WorkspacePublicationState { return { id, workspaceSlug: slug, kind: "course", draftRevision: 3, draftHash: hash, current: version() } }
function result(): WorkspacePublicationResult {
  return { status: "published", state: state(), receipt: { requestId, versionId, status: "published", acceptedRevision: 3,
    documentHash: hash, publication: version() } }
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } })
}

describe("workspace publication client protocol", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it("loads private publication state without confusing an unpublished draft or an older live revision", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    fetch.mockResolvedValueOnce(response({ ...state(), current: null }))
    expect((await getWorkspacePublicationState(slug, id, "course")).current).toBeNull()
    const older = { ...state(), current: { ...version(), sourceRevision: 2, documentHash: nextHash } }
    fetch.mockResolvedValueOnce(response(older))
    expect(await getWorkspacePublicationState(slug, id, "course")).toEqual(older)
    expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store" }))
    const bad = [
      { ...state(), id: otherId }, { ...state(), workspaceSlug: "other-workspace" }, { ...state(), kind: "report" },
      { ...state(), current: { ...version(), publicUrl: "https://outside.invalid/public" } },
      { ...state(), current: { ...version(), versionUrl: `${version().versionUrl}?token=unexpected` } },
      { ...state(), current: { ...version(), sourceRevision: 4 } },
      { ...state(), current: { ...version(), documentHash: nextHash } },
      { ...state(), actor: { role: "admin" } },
    ]
    for (const value of bad) {
      fetch.mockResolvedValueOnce(response(value))
      await expect(getWorkspacePublicationState(slug, id, "course")).rejects.toMatchObject({ uncertain: false })
    }
  })

  it("sends only the reviewed publication intent and validates its acknowledgement after caller mutation", async () => {
    const value = input(), fetch = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ requestId, versionId, expectedRevision: 3, expectedDraftHash: hash })
      expect(body).not.toHaveProperty("id")
      value.id = otherId; value.requestId = otherId; value.expectedDraftHash = nextHash; value.expectedRevision = 4
      return Promise.resolve(response(result()))
    })
    vi.stubGlobal("fetch", fetch)
    expect(await publishWorkspaceDraft(slug, value, "course")).toEqual(result())
    expect(fetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, signal: expect.any(AbortSignal) }))
  })

  it("retains original published receipts beside newer current state and rejects mismatched acknowledgements", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const conflict: WorkspacePublicationResult = { ...result(), status: "conflict", state: { ...state(), draftRevision: 4, draftHash: nextHash,
      current: { ...version(), versionId: nextVersion, versionUrl: `/v/${publicId}/${nextVersion}`, sourceRevision: 4, documentHash: nextHash } } }
    fetch.mockResolvedValueOnce(response(conflict, 409))
    const received = await publishWorkspaceDraft(slug, input(), "course")
    expect(received).toEqual(conflict)
    expect(received.receipt.publication?.versionUrl).not.toBe(received.state.current?.versionUrl)
    const refused = { ...conflict, receipt: { ...conflict.receipt, status: "conflict", acceptedRevision: null, publication: null } }
    fetch.mockResolvedValueOnce(response(refused, 409))
    expect((await publishWorkspaceDraft(slug, input(), "course")).receipt.publication).toBeNull()
    const bad: unknown[] = [
      { ...result(), receipt: { ...result().receipt, requestId: otherId } },
      { ...result(), receipt: { ...result().receipt, versionId: nextVersion } },
      { ...result(), receipt: { ...result().receipt, documentHash: nextHash } },
      { ...result(), receipt: { ...result().receipt, acceptedRevision: 2 } },
      { ...result(), receipt: { ...result().receipt, publication: { ...version(), sourceRevision: 2 } } },
      { ...result(), receipt: { ...result().receipt, publication: { ...version(), documentHash: nextHash } } },
      { ...result(), state: { ...state(), current: { ...version(), versionId: nextVersion, versionUrl: `/v/${publicId}/${nextVersion}` } } },
      { ...result(), state: { ...state(), current: { ...version(), publicId: `report_${"1".repeat(32)}` } } },
      { ...result(), receipt: { ...result().receipt, publication: { ...version(), versionUrl: `${version().versionUrl}#changed` } } },
    ]
    for (const value of bad) {
      fetch.mockResolvedValueOnce(response(value))
      await expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    }
  })

  it("distinguishes definite access refusals from unknown write outcomes without leaking server errors", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    for (const status of [400, 401, 403, 404]) {
      fetch.mockResolvedValueOnce(response({ error: "authored-private-server-detail" }, status))
      await expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: false })
    }
    fetch.mockRejectedValueOnce(new Error("authored-private-server-detail"))
    await expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true,
      message: "Publication could not be confirmed. Keep this tab open and retry the same publication." })
    fetch.mockResolvedValueOnce(response({ error: "authored-private-server-detail" }, 503))
    await expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    fetch.mockResolvedValueOnce(response({ error: "authored-private-server-detail" }, 503))
    await expect(getWorkspacePublicationState(slug, id, "course")).rejects.toMatchObject({ uncertain: false,
      message: "Publication status could not be loaded. A version may already be public." })
  })

  it("bounds original response bytes and fatal UTF8 decoding and aborts the thirty-second request", async () => {
    const cancel = vi.fn(), fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(128 * 1024 + 1)) }, cancel })
    fetch.mockResolvedValueOnce(new Response(oversized, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } }))
    await expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    expect(cancel).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } }))
    await expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    vi.useFakeTimers()
    const observed: { signal?: AbortSignal } = {}
    fetch.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      observed.signal = init.signal as AbortSignal
      observed.signal.addEventListener("abort", () => reject(new DOMException("Authored abort", "AbortError")), { once: true })
    }))
    const rejection = expect(publishWorkspaceDraft(slug, input(), "course")).rejects.toMatchObject({ uncertain: true })
    await vi.advanceTimersByTimeAsync(30_001)
    await rejection
    expect(observed.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects invalid or actor-bearing intents and a pre-cancelled request before any fetch", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const bad = [
      { ...input(), id: "not-an-id" }, { ...input(), requestId: requestId.toUpperCase() },
      { ...input(), expectedRevision: 0 }, { ...input(), expectedDraftHash: hash.toUpperCase() },
      { ...input(), actor: { role: "admin" } },
    ]
    for (const value of bad) await expect(publishWorkspaceDraft(slug, value, "course")).rejects.toMatchObject({ uncertain: false })
    for (const target of ["..", "other/workspace", "core-growth?override=1"]) {
      await expect(getWorkspacePublicationState(target, id, "course")).rejects.toMatchObject({ uncertain: false })
    }
    const controller = new AbortController(); controller.abort()
    await expect(publishWorkspaceDraft(slug, input(), "course", controller.signal)).rejects.toMatchObject({ uncertain: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})
