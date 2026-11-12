import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/workspaces/[workspaceSlug]/visualizations/[visualizationId]/removal/route"
import { createLookupHash } from "@/lib/auth"
import { getWorkspaceRemovalReview, removeWorkspaceDraft } from "@/lib/client/workspace-removals"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"
const mock = vi.hoisted(() => ({ token: vi.fn(), provider: vi.fn(), get: vi.fn(), remove: vi.fn() }))
vi.mock("@/lib/server-auth", () => ({ getSessionToken: mock.token }))
vi.mock("@/lib/persistence/factory", () => ({ getPersistenceProvider: mock.provider }))
const origin = "http://127.0.0.1:3100", slug = "core-growth", id = "19c0af65-40c2-4fa0-bf01-63ad5629cfea", requestId = "21a0d811-bd61-45c3-8994-fc2b43d8f757"
const expected = { draftRevision: 3, draftHash: "a".repeat(64), status: "published" as const, publishedVersionId: null }
const review = { id, kind: "course" as const, title: "Authored removal", ...expected }
const input = { id, requestId, expected }
const result = { status: "removed", current: { id, ...expected, status: "removed" }, receipt: { requestId, status: "removed", removedAt: "2026-11-12T12:00:00.000Z" } }
const url = `${origin}/api/workspaces/${slug}/visualizations/${id}/removal`, context = { params: Promise.resolve({ workspaceSlug: slug, visualizationId: id }) }
function post(value: unknown = { requestId, expected }, headers = { Origin: origin, "Content-Type": "application/json" }, address = url) {
  return new Request(address, { method: "POST", headers, body: JSON.stringify(value) })
}
function response(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } }) }
function privateResponse(value: Response, status: number) { expect(value.status).toBe(status); expect(value.headers.get("cache-control")).toBe("private, no-store"); expect(value.headers.get("vary")).toBe("Cookie") }
describe("workspace removal HTTP and client", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin); mock.token.mockResolvedValue("authored"); mock.provider.mockResolvedValue({ workspaceRemovals: { get: mock.get, remove: mock.remove } }); mock.get.mockResolvedValue(review); mock.remove.mockResolvedValue(result) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers() })
  it("derives current cookie access and returns a minimal private review and receipt", async () => {
    const get = await GET(new Request(url), context); privateResponse(get, 200); expect(await get.json()).toEqual(review)
    const removed = await POST(post(), context); privateResponse(removed, 200); expect(await removed.json()).toEqual(result)
    expect(mock.remove).toHaveBeenCalledWith({ tokenHash: createLookupHash("authored"), workspaceSlug: slug }, input)
  })
  it.each(["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "INVALID_INPUT"] as const)("maps %s without leaking backend details", async (code) => {
    mock.remove.mockRejectedValue(new WorkspaceDraftAccessError(code)); const value = await POST(post(), context)
    privateResponse(value, { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400 }[code]); expect((await value.json()).code).toBe(code)
  })
  it("refuses missing sessions before provider access and absent reviews as 404", async () => {
    mock.token.mockResolvedValue(null); privateResponse(await POST(post(), context), 401); expect(mock.provider).not.toHaveBeenCalled()
    mock.token.mockResolvedValue("authored"); mock.get.mockResolvedValue(null); privateResponse(await GET(new Request(url), context), 404)
  })
  it("requires exact configured Origin and rejects query-bearing mutation targets", async () => {
    for (const value of ["", "null", "https://outside.invalid", origin + "/", "http://localhost:3100"]) privateResponse(await POST(post(undefined, { Origin: value, "Content-Type": "application/json" }), context), 403)
    privateResponse(await POST(post(undefined, undefined, url + "?x=1"), context), 400); expect(mock.remove).not.toHaveBeenCalled()
  })
  it("fails closed on invalid configuration and ambiguous backend outcomes", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://private:secret@invalid.example"); const refused = await POST(post(), context); privateResponse(refused, 503); expect(await refused.text()).not.toContain("secret")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin); mock.remove.mockRejectedValue(new Error("private SQL details")); const value = await POST(post(), context); privateResponse(value, 503); expect(await value.text()).not.toContain("SQL")
  })
  it("validates exact tuple properties, bounds and canonical identities", async () => {
    const invalid = [{ requestId, expected, actorId: "forged" }, { requestId: requestId.toUpperCase(), expected }, ...[
      { ...expected, draftRevision: 0 }, { ...expected, status: "removed" }, { ...expected, publishedVersionId: "bad" }, { ...expected, draftHash: "A".repeat(64) }, { ...expected, extra: true },
    ].map((expected) => ({ requestId, expected }))]
    for (const body of invalid) privateResponse(await POST(post(body), context), 400)
    privateResponse(await POST(post({ requestId, expected, padding: "x".repeat(16384) }), context), 400); expect(mock.remove).not.toHaveBeenCalled()
  })
  it("returns conflict with current state without claiming an accepted removal", async () => {
    mock.remove.mockResolvedValue({ ...result, status: "conflict", receipt: { requestId, status: "conflict", removedAt: null } }); privateResponse(await POST(post(), context), 409)
  })
  it("client validates review and captures an immutable payload before awaiting fetch", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(review)).mockResolvedValueOnce(response(result)); vi.stubGlobal("fetch", fetcher)
    expect(await getWorkspaceRemovalReview(slug, id, "course")).toEqual(review)
    expect(await removeWorkspaceDraft(slug, input)).toEqual(result)
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ requestId, expected })
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", method: "POST" })
  })
  it("client keeps response loss uncertain and permits the identical retry", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(response(result)); vi.stubGlobal("fetch", fetcher)
    await expect(removeWorkspaceDraft(slug, input)).rejects.toMatchObject({ uncertain: true })
    expect(await removeWorkspaceDraft(slug, input)).toEqual(result); expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
  })
  it.each([400, 401, 403, 404])("client treats HTTP %i as a refusal", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, status))); await expect(removeWorkspaceDraft(slug, input)).rejects.toMatchObject({ uncertain: false })
  })
  it("client rejects forged acknowledgements, missing no-store and oversized bodies", async () => {
    for (const value of [response({ ...result, current: { ...result.current, draftHash: "b".repeat(64) } }), response({ ...result, receipt: { ...result.receipt, requestId: id } }),
      response({ ...result, current: { ...result.current, document: "private" } }), Response.json(result), response("x".repeat(16385))]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value)); await expect(removeWorkspaceDraft(slug, input)).rejects.toMatchObject({ uncertain: true })
    }
  })
  it("client bounds a stalled response body with the same uncertain outcome", async () => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }), { headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json" } })))
    const promise = expect(removeWorkspaceDraft(slug, input)).rejects.toMatchObject({ uncertain: true }); await vi.advanceTimersByTimeAsync(30_001); await promise
  })
})
