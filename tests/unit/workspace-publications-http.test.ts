// T2: actual compiler/HTTP services with authored provider/storage boundaries.
import { createHash } from "node:crypto"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createLookupHash } from "@/lib/auth"
import * as compiler from "@/lib/artifacts/compiler"
import { stageWorkspacePublication, workspacePublicationStorageKey, PUBLICATION_HTML_LIMIT } from "@/lib/artifacts/publication"
import { buildPublicationContentSecurityPolicy, isPublicationContentSecurityPolicy } from "@/packages/domain/publication-security"
import { createStarterCourseDocument, createStarterReportDocument } from "@/packages/domain/fixtures"
import { contentHash } from "@/packages/domain/serialization"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"
import type { PreparedWorkspacePublication, PublicWorkspaceArtifact, PublishWorkspaceDraftInput, WorkspacePublicationArtifact, WorkspacePublicationResult } from "@/packages/backend-contracts/workspace-publications"
import type { StorageAdapter, PutObjectInput, StoredObject } from "@/packages/storage/provider"
import { GET as getState, POST as publish } from "@/app/api/workspaces/[workspaceSlug]/visualizations/[visualizationId]/publications/route"
import { GET as live } from "@/app/v/[publicId]/route"
import { GET as version } from "@/app/v/[publicId]/[versionId]/route"
import { GET as legacyFile } from "@/app/files/[...segments]/route"

const mock = vi.hoisted(() => ({ get: vi.fn(), prepare: vi.fn(), commit: vi.fn(), resolve: vi.fn(), token: vi.fn(), provider: vi.fn(), storage: vi.fn(), legacyRead: vi.fn() }))
vi.mock("@/lib/server-auth", () => ({ getSessionToken: mock.token }))
vi.mock("@/lib/persistence/factory", () => ({ getPersistenceProvider: mock.provider }))
vi.mock("@/lib/storage/factory", () => ({ getStorageAdapter: mock.storage }))
vi.mock("@/lib/storage", () => ({ readStoredFile: mock.legacyRead }))

const origin = "http://127.0.0.1:3100", slug = "core-growth"
const id = "19c0af65-40c2-4fa0-bf01-63ad5629cfea", requestId = "21a0d811-bd61-45c3-8994-fc2b43d8f757", versionId = "39c0af65-40c2-4fa0-bf01-63ad5629cfea"
const url = `${origin}/api/workspaces/${slug}/visualizations/${id}/publications`
const context = { params: Promise.resolve({ workspaceSlug: slug, visualizationId: id }) }
const time = "2026-11-06T11:00:00.000Z"
const course = createStarterCourseDocument(), report = createStarterReportDocument()
const rawHash = (body: Buffer | string) => createHash("sha256").update(body).digest("hex")

class AuthoredStorage implements StorageAdapter {
  readonly kind = "local" as const
  objects = new Map<string, Buffer>()
  async health() { return { ok: true, message: "Authored boundary", checkedAt: time } }
  get = vi.fn(async ({ key }: { key: string }): Promise<StoredObject | null> => {
    const body = this.objects.get(key)
    return body ? { key, body: Buffer.from(body), contentType: "application/json", sizeBytes: body.length, contentHash: rawHash(body), url: this.getPublicUrl(key) } : null
  })
  put = vi.fn(async (input: PutObjectInput): Promise<StoredObject> => {
    if (input.immutable && this.objects.has(input.key)) throw Object.assign(new Error("Authored existing object"), { code: "EEXIST" })
    const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.from(input.body)
    this.objects.set(input.key, body)
    return { key: input.key, body: Buffer.from(body), contentType: input.contentType, sizeBytes: body.length, contentHash: rawHash(body), url: this.getPublicUrl(input.key) }
  })
  delete = vi.fn(async ({ key }: { key: string }) => { this.objects.delete(key) })
  async exists({ key }: { key: string }) { return this.objects.has(key) }
  getPublicUrl(key: string) { return `/files/${key}` }
}

function ready(kind: "course" | "report" = "course"): PreparedWorkspacePublication {
  const document = structuredClone(kind === "course" ? course : report)
  const binding = { actorId: "legacy-user:authored", teamId: "legacy-team:authored", workspaceId: "legacy-workspace:authored",
    visualizationId: id, publicId: `${kind}_${"a".repeat(32)}`, kind, requestId, versionId, expectedRevision: 2, expectedDraftHash: contentHash(document) }
  return { status: "ready", preparedAt: time, binding, artifactStorageKey: workspacePublicationStorageKey(binding), document,
    state: { id, workspaceSlug: slug, kind, draftRevision: 2, draftHash: binding.expectedDraftHash, current: null } }
}
function input(prepared = current): PublishWorkspaceDraftInput {
  return { id, requestId, versionId, expectedRevision: prepared.binding.expectedRevision, expectedDraftHash: prepared.binding.expectedDraftHash }
}
function body(prepared = current) {
  const value = input(prepared)
  return { requestId: value.requestId, versionId: value.versionId, expectedRevision: value.expectedRevision, expectedDraftHash: value.expectedDraftHash }
}
function post(value: unknown = body(), headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) })
}
function acknowledgement(artifact: WorkspacePublicationArtifact, prepared = current): WorkspacePublicationResult {
  const publication = { publicId: prepared.binding.publicId, versionId, sourceRevision: 2, documentHash: prepared.binding.expectedDraftHash,
    artifactHash: artifact.artifactHash, createdAt: time, title: prepared.document.title,
    publicUrl: `/v/${prepared.binding.publicId}`, versionUrl: `/v/${prepared.binding.publicId}/${versionId}` }
  return { status: "published", state: { ...prepared.state, current: publication },
    receipt: { requestId, versionId, status: "published", acceptedRevision: 2, documentHash: publication.documentHash, publication } }
}
function reference(artifact: WorkspacePublicationArtifact, prepared = current): PublicWorkspaceArtifact {
  const publication = artifact.manifest.publication as { storageBytes: number }
  return { publicId: prepared.binding.publicId, versionId, kind: prepared.binding.kind, storageKey: artifact.storageKey,
    storageHash: artifact.storageHash, storageBytes: publication.storageBytes, artifactHash: artifact.artifactHash,
    documentHash: prepared.binding.expectedDraftHash, manifest: artifact.manifest }
}
function privateResponse(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("vary")).toBe("Cookie")
}
let storage: AuthoredStorage, current: PreparedWorkspacePublication

describe("workspace publication HTTP staging and delivery boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_APP_URL", origin)
    storage = new AuthoredStorage(); current = ready()
    mock.token.mockResolvedValue("authored-session-token")
    mock.provider.mockResolvedValue({ workspacePublications: { get: mock.get, prepare: mock.prepare, commit: mock.commit, resolve: mock.resolve } })
    mock.storage.mockResolvedValue(storage); mock.get.mockImplementation(async () => current.state)
    mock.prepare.mockImplementation(async () => current)
    mock.commit.mockImplementation(async (_access, _input, artifact) => acknowledgement(artifact))
    mock.resolve.mockResolvedValue(null)
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("keeps unauthenticated state and publication responses private before provider or object access", async () => {
    mock.token.mockResolvedValue(null)
    for (const response of [await getState(new Request(url), context), await publish(post(), context)]) {
      privateResponse(response, 401); expect(await response.text()).not.toContain(current.document.title)
    }
    expect(mock.provider).not.toHaveBeenCalled(); expect(mock.storage).not.toHaveBeenCalled()
  })

  it("uses only the configured origin including real normalized NextRequest behavior and fails closed on bad configuration", async () => {
    const request = new NextRequest(post())
    expect(new URL(request.url).origin).toBe("http://localhost:3100")
    privateResponse(await publish(request, context), 200)
    for (const value of ["http://localhost:3100", "null", "", `${origin},https://outside.invalid`]) {
      const response = await publish(new NextRequest(post(body(), { Origin: value })), context)
      privateResponse(response, 403); expect((await response.json()).code).toBe("INVALID_ORIGIN")
    }
    for (const value of ["", "javascript:bad", `${origin}/other`, `${origin}?private=secret`, "https://user:secret@app.invalid"]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", value)
      const response = await publish(post(), context); privateResponse(response, 503)
      expect(await response.text()).not.toContain("secret")
    }
    expect(mock.prepare).toHaveBeenCalledTimes(1)
  })

  it("rejects actor document artifact malformed oversized and query-bearing inputs before the provider", async () => {
    const invalid = [{ ...body(), actorId: "forged" }, { ...body(), document: current.document }, { ...body(), artifactStorageKey: "forged" },
      { ...body(), expectedRevision: 0 }, { ...body(), expectedDraftHash: "wrong" }, { ...body(), versionId: "wrong" }, { ...body(), extra: "x".repeat(16 * 1024) }]
    for (const value of invalid) privateResponse(await publish(post(value), context), 400)
    privateResponse(await publish(post(body(), { "Content-Type": "text/plain" }), context), 400)
    privateResponse(await publish(new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: new Uint8Array([255]) }), context), 400)
    for (const method of [getState, publish]) privateResponse(await method(new Request(`${url}?team=forged`), context), 400)
    privateResponse(await publish(post(), { params: Promise.resolve({ workspaceSlug: slug, visualizationId: "../other" }) }), 400)
    expect(mock.provider).not.toHaveBeenCalled()
  })

  it("scopes state reads and redacts missing role and unknown storage or database failures", async () => {
    privateResponse(await getState(new Request(url), context), 200)
    expect(mock.get).toHaveBeenCalledWith({ tokenHash: createLookupHash("authored-session-token"), workspaceSlug: slug }, id)
    mock.get.mockResolvedValue(null); privateResponse(await getState(new Request(url), context), 404)
    mock.prepare.mockRejectedValue(new WorkspaceDraftAccessError("FORBIDDEN")); privateResponse(await publish(post(), context), 403)
    mock.prepare.mockRejectedValue(new Error("private-database-url-password"))
    const response = await publish(post(), context); privateResponse(response, 503)
    expect(await response.text()).not.toContain("private-database")
    expect(storage.put).not.toHaveBeenCalled()
  })

  it("compiles and verifies real Course and Report envelopes while keeping actor and storage metadata outside HTTP acknowledgements", async () => {
    for (const kind of ["course", "report"] as const) {
      current = ready(kind)
      const response = await publish(post(), context); privateResponse(response, 200)
      const result = await response.json()
      expect(result.receipt.publication.documentHash).toBe(contentHash(current.document))
      expect(result.receipt.publication.versionUrl).toBe(`/v/${current.binding.publicId}/${versionId}`)
      expect(JSON.stringify(result)).not.toMatch(/legacy-user:|canonical-publications|authored-session-token/)
      const bytes = storage.objects.get(current.artifactStorageKey)!
      const envelope = JSON.parse(bytes.toString("utf8"))
      expect(envelope.html).toContain(current.document.title)
      expect(envelope.manifest.rendererVersion).toBe(`visualization-${kind}-public-v1`)
      expect(envelope.manifest.runtimeFeatures).toContain("no-analytics")
      expect(envelope.html).not.toContain("/api/events")
      expect(rawHash(envelope.html)).toBe(envelope.rawHtmlHash)
      expect(contentHash(envelope.html)).toBe(envelope.manifest.artifactHash)
      expect(envelope.rawHtmlHash).not.toBe(envelope.manifest.artifactHash)
    }
    expect(storage.put.mock.calls.every(([value]) => value.immutable === true)).toBe(true)
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it("derives the publication actor only from the current cookie and returns stored current receipts without touching storage", async () => {
    await publish(post(), context)
    const acceptedArtifact = mock.commit.mock.calls[0][2] as WorkspacePublicationArtifact
    expect(mock.prepare).toHaveBeenCalledWith({ tokenHash: createLookupHash("authored-session-token"), workspaceSlug: slug }, input())
    const accepted = acknowledgement(acceptedArtifact)
    mock.prepare.mockResolvedValue(accepted); mock.storage.mockClear()
    privateResponse(await publish(post(), context), 200)
    expect(mock.storage).not.toHaveBeenCalled()
    mock.prepare.mockResolvedValue({ ...accepted, status: "conflict", state: { ...accepted.state, draftRevision: 3, draftHash: "c".repeat(64) } })
    const response = await publish(post(), context); privateResponse(response, 409)
    expect((await response.json()).receipt).toEqual(accepted.receipt)
  })

  it("reconciles an existing same-intent envelope without recompiling or replacing its original bytes", async () => {
    const first = await stageWorkspacePublication(storage, current)
    const original = Buffer.from(storage.objects.get(current.artifactStorageKey)!)
    vi.spyOn(compiler, "compileVisualizationArtifact").mockRejectedValue(new Error("New renderer not available"))
    const resumed = await stageWorkspacePublication(storage, current)
    expect(resumed).toEqual(first); expect(storage.put).toHaveBeenCalledTimes(1)
    expect(storage.objects.get(current.artifactStorageKey)).toEqual(original)
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it("reconciles an exclusive-create race from durable bytes rather than the losing put acknowledgement", async () => {
    await stageWorkspacePublication(storage, current)
    const original = Buffer.from(storage.objects.get(current.artifactStorageKey)!)
    storage.get.mockResolvedValueOnce(null)
    const result = await stageWorkspacePublication(storage, current)
    expect(result.storageHash).toBe(rawHash(original))
    expect(storage.objects.get(current.artifactStorageKey)).toEqual(original)
    expect(storage.delete).not.toHaveBeenCalled()
  })

  it("retains a completed object after a lost write acknowledgement and retries the same publication", async () => {
    const originalPut = storage.put.getMockImplementation()!
    storage.put.mockImplementationOnce(async (value) => { await originalPut(value); throw new Error("Lost put acknowledgement") })
    privateResponse(await publish(post(), context), 503)
    expect(mock.commit).not.toHaveBeenCalled(); expect(storage.objects.size).toBe(1)
    const original = Buffer.from(storage.objects.get(current.artifactStorageKey)!)
    privateResponse(await publish(post(), context), 200)
    expect(storage.objects.get(current.artifactStorageKey)).toEqual(original)
    expect(storage.put).toHaveBeenCalledTimes(1); expect(storage.delete).not.toHaveBeenCalled()
  })

  it("preserves staged bytes after an uncertain commit and reconciles a later stored acknowledgement", async () => {
    mock.commit.mockRejectedValueOnce(new Error("Unknown COMMIT outcome"))
    privateResponse(await publish(post(), context), 503)
    const original = Buffer.from(storage.objects.get(current.artifactStorageKey)!)
    const accepted = acknowledgement(mock.commit.mock.calls[0][2])
    mock.prepare.mockResolvedValue(accepted)
    privateResponse(await publish(post(), context), 200)
    expect(storage.objects.get(current.artifactStorageKey)).toEqual(original)
    expect(mock.commit).toHaveBeenCalledTimes(1); expect(storage.delete).not.toHaveBeenCalled()
  })

  it("rejects corrupt mismatched and partially written envelopes without committing or deleting them", async () => {
    await stageWorkspacePublication(storage, current)
    const original = Buffer.from(storage.objects.get(current.artifactStorageKey)!)
    const envelope = JSON.parse(original.toString("utf8"))
    for (const corrupt of [Buffer.from("{partial"), Buffer.from(JSON.stringify({ ...envelope, html: "replaced" })),
      Buffer.from(JSON.stringify({ ...envelope, binding: { ...envelope.binding, requestId: "49c0af65-40c2-4fa0-bf01-63ad5629cfea" } })),
      Buffer.from(JSON.stringify({ ...envelope, contentSecurityPolicy: "script-src 'unsafe-inline'" }))]) {
      storage.objects.set(current.artifactStorageKey, corrupt)
      privateResponse(await publish(post(), context), 503)
      expect(storage.objects.get(current.artifactStorageKey)).toEqual(corrupt)
    }
    expect(mock.commit).not.toHaveBeenCalled(); expect(storage.delete).not.toHaveBeenCalled()
  })

  it("serves only verified committed public HTML with stored CSP and same-origin relative live redirects", async () => {
    const artifact = await stageWorkspacePublication(storage, current)
    const ref = reference(artifact)
    mock.resolve.mockResolvedValue(ref); mock.token.mockClear()
    const liveContext = { params: Promise.resolve({ publicId: ref.publicId }) }
    const versionContext = { params: Promise.resolve({ publicId: ref.publicId, versionId }) }
    const redirect = await live(new NextRequest(`${origin}/v/${ref.publicId}`), liveContext)
    expect(redirect.status).toBe(307); expect(redirect.headers.get("location")).toBe(`/v/${ref.publicId}/${versionId}`)
    const response = await version(new Request(`${origin}/v/${ref.publicId}/${versionId}`), versionContext)
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate")
    expect(isPublicationContentSecurityPolicy(response.headers.get("content-security-policy"))).toBe(true)
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    const html = await response.text(); expect(html).toContain(current.document.title)
    expect(response.headers.get("etag")).toBe(`"${rawHash(html)}"`)
    expect(mock.token).not.toHaveBeenCalled()
    expect((await version(new Request(`${origin}/v/${ref.publicId}/${versionId}?token=forged`), versionContext)).status).toBe(404)
    storage.objects.set(current.artifactStorageKey, Buffer.from("corrupt"))
    const unavailable = await version(new Request(`${origin}/v/${ref.publicId}/${versionId}`), versionContext)
    expect(unavailable.status).toBe(503); expect(unavailable.headers.get("cache-control")).toBe("private, no-store")
    mock.resolve.mockResolvedValue(null)
    expect((await live(new Request(`${origin}/v/${ref.publicId}`), liveContext)).status).toBe(404)
  })

  it("blocks reserved canonical objects and decoded traversal through raw files while retaining ordinary legacy file delivery", async () => {
    for (const segments of [["canonical-publications", id, "orphan.json"], ["CANONICAL-PUBLICATIONS", "orphan.json"], ["..", ".data", "storage"], ["a/../canonical-publications"], ["a\\..\\canonical-publications"]]) {
      const response = await legacyFile(new Request(`${origin}/files/blocked`), { params: Promise.resolve({ segments }) })
      expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("private, no-store")
    }
    expect(mock.legacyRead).not.toHaveBeenCalled()
    mock.legacyRead.mockResolvedValue(Buffer.from("Authored legacy media"))
    const response = await legacyFile(new Request(`${origin}/files/uploads/authored.txt`), { params: Promise.resolve({ segments: ["uploads", "authored.txt"] }) })
    expect(response.status).toBe(200); expect(await response.text()).toBe("Authored legacy media")
    expect(response.headers.get("cache-control")).toContain("immutable")
  })

  it("bounds generated publications before object writes and preserves the separate preview runtime", async () => {
    const preview = await compiler.compileVisualizationArtifact(current.document, { visualizationId: "draft-preview", versionId: "draft-preview", preview: true })
    expect(preview.manifest.rendererVersion).toBe("visualization-course-html-v2")
    expect(preview.manifest.runtimeFeatures).toContain("in-memory-course-progress")
    expect(preview.html).not.toContain("data-version-id=")
    expect(preview.html).not.toContain("iv:public:")
    expect(isPublicationContentSecurityPolicy(buildPublicationContentSecurityPolicy([]))).toBe(true)
    expect(isPublicationContentSecurityPolicy("default-src 'none'; script-src 'unsafe-inline'" )).toBe(false)
    vi.spyOn(compiler, "compileVisualizationArtifact").mockResolvedValue({ ...preview, html: "x".repeat(PUBLICATION_HTML_LIMIT + 1) })
    privateResponse(await publish(post(), context), 400)
    expect(storage.put).not.toHaveBeenCalled(); expect(mock.commit).not.toHaveBeenCalled()
  })
})
