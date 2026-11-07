// T2: authored requests and responses only; no server, account or database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createLookupHash } from "@/lib/auth"
import { createStarterCourseDocument } from "@/packages/domain/fixtures"
import { contentHash } from "@/packages/domain/serialization"
import { WorkspaceDraftAccessError, type SaveWorkspaceDraftInput, type SaveWorkspaceDraftResult } from "@/packages/backend-contracts/workspace-drafts"
import { saveWorkspaceDraft as requestSave } from "@/lib/client/workspace-drafts"
import { GET as list, POST as save } from "@/app/api/workspaces/[workspaceSlug]/visualizations/route"
import { GET as get } from "@/app/api/workspaces/[workspaceSlug]/visualizations/[visualizationId]/route"

const mock = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), save: vi.fn(), token: vi.fn(), provider: vi.fn() }))
vi.mock("@/lib/workspace-drafts", () => ({ listWorkspaceDrafts: mock.list, getWorkspaceDraft: mock.get, saveWorkspaceDraft: mock.save }))
vi.mock("@/lib/server-auth", () => ({ getSessionToken: mock.token }))
vi.mock("@/lib/persistence/factory", () => ({ getPersistenceProvider: mock.provider }))

const origin = "http://127.0.0.1:3100", slug = "core-growth"
const id = "0dcbaf65-40c2-4fa0-bf01-63ad5629cfea", requestId = "b1a0d811-bd61-45c3-8994-fc2b43d8f757"
const url = `${origin}/api/workspaces/${slug}/visualizations`
const context = { params: Promise.resolve({ workspaceSlug: slug }) }
const detailContext = { params: Promise.resolve({ workspaceSlug: slug, visualizationId: id }) }
const authoredDocument = createStarterCourseDocument()
const input = (): SaveWorkspaceDraftInput => ({ id, requestId, expectedRevision: 0, document: structuredClone(authoredDocument) })
function acknowledgement(value = input()): SaveWorkspaceDraftResult {
  const hash = contentHash(value.document)
  return { status: "saved", receipt: { requestId: value.requestId, status: "saved", acceptedRevision: value.expectedRevision + 1, documentHash: hash },
    draft: { id: value.id, workspaceSlug: slug, kind: "course", title: value.document.title, summary: value.document.summary,
      document: value.document, draftRevision: value.expectedRevision + 1, draftHash: hash,
      createdAt: "2026-11-06T09:00:00.000Z", updatedAt: "2026-11-06T09:00:00.000Z" } }
}
function post(body: unknown = input(), headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}
function privateResponse(result: Response, status: number) {
  expect(result.status).toBe(status)
  expect(result.headers.get("cache-control")).toBe("private, no-store")
  expect(result.headers.get("vary")).toBe("Cookie")
}

describe("private workspace draft HTTP and client boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin); mock.list.mockResolvedValue({ items: [], nextCursor: null }); mock.get.mockResolvedValue(null); mock.save.mockResolvedValue(acknowledgement()) })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

  it("keeps unauthenticated reads and writes private without returning draft data", async () => {
    for (const method of [mock.list, mock.get, mock.save]) method.mockRejectedValue(new WorkspaceDraftAccessError("UNAUTHENTICATED"))
    for (const result of [await list(new Request(url), context), await get(new Request(`${url}/${id}`), detailContext), await save(post(), context)]) {
      privateResponse(result, 401)
      expect(await result.json()).toEqual({ code: "UNAUTHENTICATED", error: "Sign in to access workspace drafts." })
    }
  })

  it("rejects cross-origin malformed oversized and actor-bearing save bodies before persistence", async () => {
    const cases = [post(input(), { Origin: "https://outside.invalid" }), post(input(), { "Content-Type": "text/plain" }),
      post({ ...input(), actor: { role: "admin" } }), post({ ...input(), id: "not-an-id" }), post({ ...input(), document: undefined }),
      post({ ...input(), document: "x".repeat(2 * 1024 * 1024) })]
    for (let index = 0; index < cases.length; index++) privateResponse(await save(cases[index], context), index === 0 ? 403 : 400)
    privateResponse(await save(new Request(`${url}?override=1`, { method: "POST", body: "{}" }), context), 400)
    expect(mock.save).not.toHaveBeenCalled()
    // Exercise the pinned framework's normalized URL, not a native Request stand-in.
    const normalized = new NextRequest(post())
    expect(new URL(normalized.url).origin).toBe("http://localhost:3100")
    privateResponse(await save(normalized, context), 200)
    for (const badOrigin of ["http://localhost:3100", "null", "", `${origin},https://outside.invalid`]) {
      const rejected = await save(new NextRequest(post(input(), { Origin: badOrigin })), context)
      privateResponse(rejected, 403)
      expect((await rejected.json()).code).toBe("INVALID_ORIGIN")
    }
    for (const configuration of ["", "not-a-url", "javascript:alert(1)", "https://user:private-secret@app.invalid", `${origin}/other`, `${origin}/?private=query`]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", configuration)
      const rejected = await save(post(), context)
      privateResponse(rejected, 503)
      expect(await rejected.text()).not.toContain("private-secret")
    }
    expect(mock.save).toHaveBeenCalledTimes(1)
  })

  it("scopes list and detail reads and rejects query overrides while preserving not-found privacy", async () => {
    const listing = await list(new Request(`${url}?after=opaque-page`), context)
    privateResponse(listing, 200)
    expect(mock.list).toHaveBeenCalledWith(slug, "opaque-page")
    for (const query of ["?after=one&after=two", "?teamId=other"]) privateResponse(await list(new Request(url + query), context), 400)
    privateResponse(await get(new Request(`${url}/${id}`), detailContext), 404)
    expect(mock.get).toHaveBeenCalledWith(slug, id)
    privateResponse(await get(new Request(`${url}/${id}?teamId=other`), detailContext), 400)
    mock.get.mockRejectedValue(new WorkspaceDraftAccessError("FORBIDDEN"))
    privateResponse(await get(new Request(`${url}/${id}`), detailContext), 403)
  })

  it("returns committed or conflicting receipts and redacts unknown server failures", async () => {
    privateResponse(await save(post(), context), 200)
    expect(mock.save).toHaveBeenCalledWith(slug, input())
    const conflict = { ...acknowledgement(), status: "conflict" }
    mock.save.mockResolvedValue(conflict)
    const result = await save(post(), context)
    privateResponse(result, 409)
    expect(await result.json()).toEqual(conflict)
    mock.save.mockRejectedValue(new Error("private-database-url-and-token"))
    const failure = await save(post(), context)
    privateResponse(failure, 503)
    expect(await failure.text()).not.toContain("private-database-url-and-token")
  })

  it("sends a detached stable save and checks the receipt against the submitted document hash", async () => {
    const value = input(), ack = acknowledgement(value)
    const fetcher = vi.fn(async () => response(ack))
    vi.stubGlobal("fetch", fetcher)
    expect(await requestSave(slug, value)).toEqual(ack)
    const [path, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(`/api/workspaces/${slug}/visualizations`)
    expect(options.credentials).toBe("same-origin")
    expect(options.cache).toBe("no-store")
    expect(JSON.parse(String(options.body))).toEqual(value)
    const wrongHash = { ...ack, receipt: { ...ack.receipt, documentHash: "0".repeat(64) } }
    fetcher.mockImplementation(async () => response(wrongHash))
    await expect(requestSave(slug, value)).rejects.toMatchObject({ uncertain: true })
    expect(value).toEqual(input())
  })

  it("retains a valid conflict with the original receipt and a newer current document", async () => {
    const value = input(), ack = acknowledgement(value)
    const current = structuredClone(ack.draft)
    current.document.title = "A newer remote edit"
    current.title = current.document.title
    current.draftRevision = 2
    current.draftHash = contentHash(current.document)
    const conflict: SaveWorkspaceDraftResult = { status: "conflict", draft: current, receipt: ack.receipt }
    vi.stubGlobal("fetch", vi.fn(async () => response(conflict, 409)))
    expect(await requestSave(slug, value)).toEqual(conflict)
    expect(value.document.title).not.toBe(current.document.title)
    expect(value.requestId).toBe(requestId)
  })

  it("distinguishes definite refusals from lost malformed oversized and timed-out acknowledgements", async () => {
    for (const status of [400, 401, 403, 404]) {
      vi.stubGlobal("fetch", vi.fn(async () => response({ error: "refused" }, status)))
      await expect(requestSave(slug, input())).rejects.toMatchObject({ uncertain: false })
    }
    vi.stubGlobal("fetch", vi.fn(async () => response({ code: "INVALID_ORIGIN" }, 403)))
    await expect(requestSave(slug, input())).rejects.toMatchObject({ uncertain: false, message: expect.stringContaining("configured address") })
    for (const make of [() => response({}, 503), () => response({}), () => response({ ...acknowledgement(), draft: { ...acknowledgement().draft, id: requestId } }),
      () => response({ ...acknowledgement(), receipt: { ...acknowledgement().receipt, acceptedRevision: 8 } }),
      () => response("x".repeat(5 * 1024 * 1024)), () => { throw new TypeError("lost response") }]) {
      vi.stubGlobal("fetch", vi.fn(async () => make()))
      await expect(requestSave(slug, input())).rejects.toMatchObject({ name: "WorkspaceDraftRequestError", uncertain: true })
    }
    vi.useFakeTimers()
    let started!: () => void
    const ready = new Promise<void>((resolve) => { started = resolve })
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); started()
    })))
    const pending = requestSave(slug, input()).catch((error: unknown) => error)
    await ready
    await vi.advanceTimersByTimeAsync(30_001)
    expect(await pending).toMatchObject({ uncertain: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("derives service access from the current cookie token without accepting a client actor", async () => {
    const actual = await vi.importActual<typeof import("@/lib/workspace-drafts")>("@/lib/workspace-drafts")
    const drafts = { list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), get: vi.fn().mockResolvedValue(null), save: vi.fn().mockResolvedValue(acknowledgement()) }
    mock.provider.mockResolvedValue({ workspaceDrafts: drafts })
    mock.token.mockResolvedValue("authored-cookie-token")
    await actual.listWorkspaceDrafts(slug, "page")
    await actual.getWorkspaceDraft(slug, id)
    await actual.saveWorkspaceDraft(slug, input())
    const access = { tokenHash: createLookupHash("authored-cookie-token"), workspaceSlug: slug }
    expect(drafts.list).toHaveBeenCalledWith(access, "page")
    expect(drafts.get).toHaveBeenCalledWith(access, id)
    expect(drafts.save).toHaveBeenCalledWith(access, input())
    mock.provider.mockClear(); mock.token.mockResolvedValue(null)
    await expect(actual.listWorkspaceDrafts(slug)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    expect(mock.provider).not.toHaveBeenCalled()
  })
})
