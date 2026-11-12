// T2: actual route/application services; provider and object boundaries are authored.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createLookupHash } from "@/lib/auth"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"
import type { WorkspacePublicationState, WorkspaceUnpublicationResult } from "@/packages/backend-contracts/workspace-publications"
import { POST as unpublish } from "@/app/api/workspaces/[workspaceSlug]/visualizations/[visualizationId]/publications/unpublish/route"
import { GET as live } from "@/app/v/[publicId]/route"
import { GET as version } from "@/app/v/[publicId]/[versionId]/route"

const mock = vi.hoisted(() => ({ token: vi.fn(), provider: vi.fn(), unpublish: vi.fn(), resolve: vi.fn(), storage: vi.fn() }))
vi.mock("@/lib/server-auth", () => ({ getSessionToken: mock.token }))
vi.mock("@/lib/persistence/factory", () => ({ getPersistenceProvider: mock.provider }))
vi.mock("@/lib/storage/factory", () => ({ getStorageAdapter: mock.storage }))

const origin = "http://127.0.0.1:3100", slug = "core-growth"
const id = "19c0af65-40c2-4fa0-bf01-63ad5629cfea"
const requestId = "21a0d811-bd61-45c3-8994-fc2b43d8f757"
const expectedCurrentVersionId = "39c0af65-40c2-4fa0-bf01-63ad5629cfea"
const laterVersionId = "49c0af65-40c2-4fa0-bf01-63ad5629cfea"
const time = "2026-11-06T12:30:00.000Z"
const url = `${origin}/api/workspaces/${slug}/visualizations/${id}/publications/unpublish`
const context = { params: Promise.resolve({ workspaceSlug: slug, visualizationId: id }) }
const body = () => ({ requestId, expectedCurrentVersionId })
const input = () => ({ id, ...body() })
function state(kind: "course" | "report" = "course"): WorkspacePublicationState {
  return { id, workspaceSlug: slug, kind, draftRevision: 3, draftHash: "a".repeat(64), current: null }
}
function acknowledgement(kind: "course" | "report" = "course"): WorkspaceUnpublicationResult {
  return { status: "unpublished", state: state(kind), receipt: { requestId, expectedCurrentVersionId, status: "unpublished", revokedAt: time } }
}
function post(value: unknown = body(), headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) })
}
function privateResponse(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("vary")).toBe("Cookie")
}

describe("workspace unpublication HTTP access and delivery boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin)
    mock.token.mockResolvedValue("authored-session-one")
    mock.provider.mockResolvedValue({ workspacePublications: { unpublish: mock.unpublish, resolve: mock.resolve } })
    mock.unpublish.mockResolvedValue(acknowledgement()); mock.resolve.mockResolvedValue(null)
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("refuses an unauthenticated unpublish before provider or artifact access", async () => {
    mock.token.mockResolvedValue(null)
    const response = await unpublish(post(), context); privateResponse(response, 401)
    expect((await response.json()).code).toBe("UNAUTHENTICATED")
    expect(mock.provider).not.toHaveBeenCalled(); expect(mock.storage).not.toHaveBeenCalled()
  })

  it("derives current cookie access and scopes both formats without reading writing or deleting artifacts", async () => {
    for (const kind of ["course", "report"] as const) {
      mock.unpublish.mockResolvedValue(acknowledgement(kind))
      const response = await unpublish(post(), context); privateResponse(response, 200)
      expect(await response.json()).toEqual(acknowledgement(kind))
      expect(mock.unpublish).toHaveBeenLastCalledWith({ tokenHash: createLookupHash("authored-session-one"), workspaceSlug: slug }, input())
    }
    expect(mock.storage).not.toHaveBeenCalled()
  })

  it("requires the exact configured Origin despite NextRequest loopback normalization and forwarded headers", async () => {
    const request = new NextRequest(post())
    expect(new URL(request.url).origin).toBe("http://localhost:3100")
    privateResponse(await unpublish(request, context), 200)
    for (const value of ["http://localhost:3100", "null", "", `${origin},https://outside.invalid`, `${origin}/`]) {
      const response = await unpublish(post(body(), { Origin: value, "X-Forwarded-Host": "127.0.0.1:3100", "X-Forwarded-Proto": "http" }), context)
      privateResponse(response, 403); expect((await response.json()).code).toBe("INVALID_ORIGIN")
    }
    expect(mock.unpublish).toHaveBeenCalledTimes(1)
  })

  it("fails closed on absent or malformed origin configuration without exposing configuration values", async () => {
    for (const value of ["", "javascript:secret", `${origin}/other`, `${origin}?private=secret`, "https://user:secret@app.invalid"]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", value)
      const response = await unpublish(post(), context); privateResponse(response, 503)
      expect(await response.text()).not.toContain("secret")
    }
    expect(mock.provider).not.toHaveBeenCalled(); expect(mock.storage).not.toHaveBeenCalled()
  })

  it("rejects forged actor storage document revision and noncanonical identity fields", async () => {
    const invalid = [{ ...body(), actorId: "forged" }, { ...body(), storageKey: "private-object" }, { ...body(), document: { title: "private" } },
      { ...body(), id }, { ...body(), expectedRevision: 3 }, { ...body(), expectedDraftHash: "a".repeat(64) },
      { ...body(), requestId: requestId.toUpperCase() }, { ...body(), expectedCurrentVersionId: expectedCurrentVersionId.toUpperCase() },
      { ...body(), requestId: "wrong" }, { ...body(), expectedCurrentVersionId: null }, { requestId }, [], null]
    for (const value of invalid) privateResponse(await unpublish(post(value), context), 400)
    expect(mock.provider).not.toHaveBeenCalled()
  })

  it("bounds actual streamed bytes cancels oversized bodies and refuses malformed UTF8 and JSON", async () => {
    const cancelled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(16 * 1024 + 1)) }, cancel: cancelled })
    const oversized = new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Content-Length": "1" },
      body: stream, duplex: "half" } as RequestInit & { duplex: "half" })
    privateResponse(await unpublish(oversized, context), 400); expect(cancelled).toHaveBeenCalledTimes(1)
    for (const value of [new Uint8Array([255]), Buffer.from("{unfinished"), Buffer.from(JSON.stringify({ ...body(), padding: "x".repeat(16 * 1024) }))]) {
      privateResponse(await unpublish(new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: value }), context), 400)
    }
    expect(mock.provider).not.toHaveBeenCalled()
  })

  it("rejects media missing bodies query overrides and invalid path IDs before application access", async () => {
    privateResponse(await unpublish(post(body(), { "Content-Type": "text/plain" }), context), 400)
    privateResponse(await unpublish(new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" } }), context), 400)
    privateResponse(await unpublish(new Request(`${url}?actorId=forged`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body()) }), context), 400)
    privateResponse(await unpublish(post(), { params: Promise.resolve({ workspaceSlug: slug, visualizationId: "../other" }) }), 400)
    privateResponse(await unpublish(post(), { params: Promise.resolve({ workspaceSlug: slug, visualizationId: id.toUpperCase() }) }), 400)
    expect(mock.provider).not.toHaveBeenCalled()
  })

  it("keeps current authorization and scope refusals private without leaking backend messages", async () => {
    for (const [code, status] of [["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["INVALID_INPUT", 400]] as const) {
      const error = new WorkspaceDraftAccessError(code)
      error.message = "authored-private-database-password"
      mock.unpublish.mockRejectedValue(error)
      const response = await unpublish(post(), context); privateResponse(response, status)
      const result = await response.json(); expect(result.code).toBe(code)
      expect(JSON.stringify(result)).not.toContain("authored-private")
    }
    expect(mock.storage).not.toHaveBeenCalled()
  })

  it("retains the exact request through an unknown commit acknowledgement without storage compensation", async () => {
    mock.unpublish.mockRejectedValueOnce(new Error("authored-private-database-password"))
    const uncertain = await unpublish(post(), context); privateResponse(uncertain, 503)
    const message = await uncertain.text(); expect(message).toContain("Retry this same unpublish request")
    expect(message).not.toContain("authored-private")
    privateResponse(await unpublish(post(), context), 200)
    expect(mock.unpublish.mock.calls.map((call) => call[1])).toEqual([input(), input()])
    expect(mock.storage).not.toHaveBeenCalled()
  })

  it("reauthorizes each replay from the current cookie and preserves an original acknowledgement across private draft changes", async () => {
    privateResponse(await unpublish(post(), context), 200)
    mock.token.mockResolvedValue("authored-session-two")
    const replay = acknowledgement(); replay.state.draftRevision = 4; replay.state.draftHash = "b".repeat(64)
    mock.unpublish.mockResolvedValue(replay)
    const response = await unpublish(post(), context); privateResponse(response, 200)
    expect((await response.json()).receipt).toEqual(acknowledgement().receipt)
    expect(mock.unpublish).toHaveBeenLastCalledWith({ tokenHash: createLookupHash("authored-session-two"), workspaceSlug: slug }, input())
    expect(mock.token).toHaveBeenCalledTimes(2); expect(mock.storage).not.toHaveBeenCalled()
  })

  it("returns conflict with the original receipt and newer publication rather than revoking or hiding it", async () => {
    const result = acknowledgement(); result.status = "conflict"
    result.state.current = { publicId: `course_${"a".repeat(32)}`, versionId: laterVersionId, sourceRevision: 3,
      documentHash: result.state.draftHash, artifactHash: "c".repeat(64), createdAt: time, title: "Newer public snapshot",
      publicUrl: `/v/course_${"a".repeat(32)}`, versionUrl: `/v/course_${"a".repeat(32)}/${laterVersionId}` }
    mock.unpublish.mockResolvedValue(result)
    const response = await unpublish(post(), context); privateResponse(response, 409)
    expect(await response.json()).toEqual(result)
    expect(mock.unpublish).toHaveBeenCalledTimes(1); expect(mock.storage).not.toHaveBeenCalled()
  })

  it("keeps revoked live and historical resolver refusals private for ordinary and conditional requests before object access", async () => {
    for (const kind of ["course", "report"] as const) {
      const publicId = `${kind}_${"a".repeat(32)}`
      const liveContext = { params: Promise.resolve({ publicId }) }
      const requests: Record<string, string>[] = [{}, { "If-None-Match": '"previous-public-html"' }]
      for (const headers of requests) {
        const responses = [await live(new Request(`${origin}/v/${publicId}`, { headers }), liveContext)]
        for (const versionId of [expectedCurrentVersionId, laterVersionId]) {
          responses.push(await version(new Request(`${origin}/v/${publicId}/${versionId}`, { headers }), { params: Promise.resolve({ publicId, versionId }) }))
        }
        for (const response of responses) {
          expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("private, no-store")
          expect(response.headers.get("etag")).toBeNull(); expect(response.headers.get("location")).toBeNull()
          expect(response.headers.get("content-security-policy")).toBeNull()
          expect(await response.text()).not.toContain("Newer public snapshot")
        }
      }
    }
    expect(mock.token).not.toHaveBeenCalled(); expect(mock.storage).not.toHaveBeenCalled()
  })

  it("distinguishes an unavailable public resolver from revocation without exposing its database failure", async () => {
    mock.resolve.mockRejectedValue(new Error("authored-private-database-password"))
    const publicId = `course_${"a".repeat(32)}`
    const response = await version(new Request(`${origin}/v/${publicId}/${expectedCurrentVersionId}`),
      { params: Promise.resolve({ publicId, versionId: expectedCurrentVersionId }) })
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.text()).not.toContain("authored-private")
    expect(mock.storage).not.toHaveBeenCalled()
  })
})
