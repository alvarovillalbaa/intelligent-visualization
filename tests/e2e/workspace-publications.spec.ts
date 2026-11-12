import { createHash, randomUUID } from "node:crypto"
import { expect, test, type Browser, type BrowserContext, type Page, type Request as PlaywrightRequest, type TestInfo } from "@playwright/test"
import { createStarterCourseDocument, createStarterReportDocument } from "../../packages/domain/fixtures"

const ORIGIN = "http://127.0.0.1:3100"
const WORKSPACE = "/app/workspaces/core-growth"
const DRAFT_API = "/api/workspaces/core-growth/visualizations"
const MAX_HTML = 8 * 1024 * 1024
type Kind = "course" | "report"
type ResponseClone = { path: string; requestId: string; status: number; cacheControl: string; contentType: string; bytes: number; body: string }
type GetState = { id: string; workspaceSlug: string; kind: string; draftRevision: number; draftHash: string; current: null | { publicId: string; versionId: string; sourceRevision: number; documentHash: string; artifactHash: string; publicUrl: string; versionUrl: string } }
type GetRead = { ordinal: number; path: string; startedAt: number; responseAt: number | null; eofAt: number | null; status: number | null; cacheControl: string; contentType: string; eof: boolean; bytes: number; sha256: string | null; state: GetState | null; bodyError: string | null; signal: { present: boolean; initialAborted: boolean | null; abortObservedAt: number | null; abortedAtEOF: boolean | null; finalAborted: boolean | null } }
type NodeGet = { ordinal: number; path: string; startStage: string; startedAt: number; responseAt: number | null; status: number | null; contentType: string | null; requestfinishedAt: number | null; requestfailedAt: number | null; errorText: string | null }
type ResponseObserver = { requests: number; jobs: Set<Promise<void>>; records: Record<string, ResponseClone>; failures: string[]; getRequests: number; getJobs: Set<Promise<void>>; getReads: GetRead[]; getFailures: string[]; stopGets: Array<() => void> }
type Publication = { publicId: string; versionId: string; sourceRevision: number; documentHash: string; artifactHash: string; title: string; publicUrl: string; versionUrl: string }

function bounded(value: unknown, limit = 384) {
  return String(value).replace(/https?:\/\/[^\s<>"']+/g, "[URL]").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, limit)
}
function query(url: URL, page = false) {
  if (url.search.length > 256) return false
  const seen = new Set<string>()
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) return false
    seen.add(key)
    if (page && key === "_rsc" && /^[A-Za-z0-9_-]{1,128}$/.test(value)) continue
    if (page && url.pathname === "/auth" && ((key === "returnTo" && value === "/app") || (key === "mode" && ["signin", "signup"].includes(value)))) continue
    if (!page && key === "v" && /^[0-9]{1,20}$/.test(value)) continue
    return false
  }
  return true
}
function localUrl(raw: string) {
  const url = new URL(raw, ORIGIN)
  expect(url.origin).toBe(ORIGIN)
  expect(url.username + url.password + url.search + url.hash).toBe("")
  return url.pathname
}

async function installObserver(context: BrowserContext, key: string, apis: string[], getEndpoint: string, expectedId: string, expectedKind: Kind) {
  await context.addInitScript(({ key, origin, apis, getEndpoint, expectedId, expectedKind }) => {
      const state: ResponseObserver = { requests: 0, jobs: new Set(), records: Object.create(null), failures: [], getRequests: 0, getJobs: new Set(), getReads: [], getFailures: [], stopGets: [] }
      Object.defineProperty(window, key, { value: state })
      async function text(copy: Request | Response, maximum: number) {
        if (!copy.body) throw new Error("observer-empty-body")
        const reader = copy.body.getReader(), chunks: Uint8Array[] = []
        let bytes = 0
        const end = Date.now() + 10_000
        try {
          while (true) {
            let timer: ReturnType<typeof setTimeout> | undefined
            const part = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("observer-body-timeout")), Math.max(1, end - Date.now()))
            })]).finally(() => clearTimeout(timer))
            if (part.done) break
            bytes += part.value.byteLength
            if (bytes > maximum) throw new Error("observer-body-overflow")
            chunks.push(part.value)
          }
          const joined = new Uint8Array(bytes)
          let offset = 0
          for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
          return { bytes, value: new TextDecoder("utf-8", { fatal: true }).decode(joined) }
        } catch (error) {
          void reader.cancel().catch(() => {})
          throw error
        } finally { reader.releaseLock() }
      }
      const original = window.fetch
      window.fetch = function (this: unknown, ...args: Parameters<typeof window.fetch>) {
        const [input, init] = args
        let selected = false, requestCopy: Request | null = null, getRead: GetRead | null = null, getSignal: AbortSignal | null = null
        try {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href)
          selected = url.origin === origin && apis.includes(url.pathname) && !url.search && !url.hash && !url.username && !url.password
            && String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST"
          const selectedGet = url.origin === origin && url.pathname === getEndpoint && !url.search && !url.hash && !url.username && !url.password
            && String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "GET"
          if (selectedGet) {
            state.getRequests++
            if (state.getReads.length >= 8) state.getFailures.push("observer-get-count-exceeded")
            else {
              getSignal = init && Object.hasOwn(init, "signal") ? init.signal ?? null : input instanceof Request ? input.signal : null
              const captured: GetRead = { ordinal: state.getRequests, path: url.pathname, startedAt: Date.now(), responseAt: null, eofAt: null, status: null, cacheControl: "", contentType: "", eof: false, bytes: 0, sha256: null, state: null, bodyError: null,
                signal: { present: getSignal !== null, initialAborted: getSignal?.aborted ?? null, abortObservedAt: null, abortedAtEOF: null, finalAborted: null } }
              getRead = captured; state.getReads.push(captured)
              const signal = getSignal
              if (signal) {
                const observedAbort = () => { captured.signal.abortObservedAt = Date.now() }
                signal.addEventListener("abort", observedAbort, { once: true })
                state.stopGets.push(() => { captured.signal.finalAborted = signal.aborted; signal.removeEventListener("abort", observedAbort) })
              }
            }
          }
          if (selected) {
            state.requests++
            if (typeof init?.body === "string") requestCopy = new Request(url, { method: "POST", body: init.body }).clone()
            else if (input instanceof Request && init?.body === undefined) requestCopy = input.clone()
            else state.failures.push("observer-unsupported-request-body")
          }
        } catch { state.failures.push("observer-request-clone-failed") }
        const result = Reflect.apply(original, this, args) as Promise<Response>
        if (getRead) {
          const captured = getRead, signal = getSignal
          const job = result.then(async (response) => {
            captured.responseAt = Date.now(); captured.status = response.status
            captured.cacheControl = response.headers.get("cache-control") ?? ""; captured.contentType = response.headers.get("content-type") ?? ""
            const body = await text(response.clone(), 128 * 1024)
            captured.eof = true; captured.eofAt = Date.now(); captured.bytes = body.bytes; captured.signal.abortedAtEOF = signal?.aborted ?? null
            captured.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.value))), (byte) => byte.toString(16).padStart(2, "0")).join("")
            const value = JSON.parse(body.value)
            if (!value || value.id !== expectedId || value.workspaceSlug !== "core-growth" || value.kind !== expectedKind
              || !Number.isSafeInteger(value.draftRevision) || value.draftRevision < 1 || typeof value.draftHash !== "string" || !/^[0-9a-f]{64}$/.test(value.draftHash)) throw new Error("observer-get-state-invalid")
            let current: GetState["current"] = null
            if (value.current !== null) {
              const publication = value.current
              if (!publication || typeof publication.publicId !== "string" || !new RegExp("^" + expectedKind + "_[0-9a-f]{32}$").test(publication.publicId)
                || typeof publication.versionId !== "string" || !/^[0-9a-f-]{36}$/.test(publication.versionId) || !Number.isSafeInteger(publication.sourceRevision) || publication.sourceRevision < 1
                || typeof publication.documentHash !== "string" || !/^[0-9a-f]{64}$/.test(publication.documentHash) || typeof publication.artifactHash !== "string" || !/^[0-9a-f]{64}$/.test(publication.artifactHash)
                || publication.publicUrl !== "/v/" + publication.publicId || publication.versionUrl !== publication.publicUrl + "/" + publication.versionId) throw new Error("observer-get-current-invalid")
              current = { publicId: publication.publicId, versionId: publication.versionId, sourceRevision: publication.sourceRevision, documentHash: publication.documentHash, artifactHash: publication.artifactHash, publicUrl: publication.publicUrl, versionUrl: publication.versionUrl }
            }
            captured.state = { id: value.id, workspaceSlug: value.workspaceSlug, kind: value.kind, draftRevision: value.draftRevision, draftHash: value.draftHash, current }
          }).catch((error: unknown) => {
            captured.bodyError = error && typeof error === "object" && "name" in error && typeof error.name === "string" ? error.name.slice(0, 64) : "UnknownError"
            if (state.getFailures.length < 8) state.getFailures.push("observer-publication-get-failed")
          }).finally(() => state.getJobs.delete(job))
          state.getJobs.add(job)
        }
        if (selected) {
          const job = result.then(async (response) => {
            const copy = response.clone()
            if (!requestCopy) throw new Error("observer-request-copy-missing")
            const [requestBody, responseBody] = await Promise.all([text(requestCopy, 2 * 1024 * 1024), text(copy, 5 * 1024 * 1024)])
            const requestId: unknown = JSON.parse(requestBody.value).requestId
            if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/.test(requestId) || state.records[requestId]) throw new Error("observer-request-identity-invalid")
            if (state.requests > 4) throw new Error("observer-request-count-exceeded")
            state.records[requestId] = { path: new URL(requestCopy.url).pathname, requestId, status: response.status, cacheControl: response.headers.get("cache-control") ?? "", contentType: response.headers.get("content-type") ?? "", bytes: responseBody.bytes, body: responseBody.value }
          }).catch(() => { if (state.failures.length < 8) state.failures.push("observer-real-save-body-failed") }).finally(() => state.jobs.delete(job))
          state.jobs.add(job)
        }
        return result
      }
    }, { key, origin: ORIGIN, apis, getEndpoint, expectedId, expectedKind })
}

async function journey(kind: Kind, browser: Browser, page: Page, info: TestInfo) {
  const auth = page.context(), label = kind === "course" ? "Course" : "Report"
  const id = randomUUID(), seedRequestId = randomUUID(), observerKey = "iv_publication_response_" + randomUUID().replaceAll("-", "")
  const savedPath = WORKSPACE + "/visualizations/" + id
  const publicationApi = DRAFT_API + "/" + id + "/publications"
  const title1 = "Authored public " + label + " " + info.project.name + " " + randomUUID().slice(0, 8)
  const title2 = title1 + " revision two"
  const document = kind === "course" ? createStarterCourseDocument() : createStarterReportDocument()
  const marker = kind === "course" ? "Authored public Course explanation." : 'Authored safe Report text <img src="https://example.invalid/not-loaded">.'
  document.title = title1; document.seo.title = title1
  if (document.kind === "course") document.course.modules[0].lessons[0].explanation = marker
  else document.summary = marker
  const authPages = new Set(["/", "/auth", "/app", WORKSPACE, savedPath, "/d/northstar-labs/slides-operating-system"])
  const publicPages = new Set<string>()
  let stage = "setup", authTarget = "/auth", postPath: string | null = null, primary: unknown
  let anonymous: BrowserContext | null = null, publicPage: Page | null = null, contextsClosed = 0
  let realPublishRequests = 0, realSaveRequests = 0, allowedReads = 0, allowedActions = 0, developmentWebSockets = 0
  const counts = { unexpectedRequests: 0, unexpectedWebSockets: 0, requestFailures: 0, httpErrors: 0, pageErrors: 0, consoleErrors: 0, dialogs: 0, analyticsRequests: 0 }
  const diagnostics: Array<{ stage: string; kind: string; detail: string }> = []
  const pending = new Set<Promise<void>>(), completed = new Set<string>(), cleanupFailures: string[] = []
  const reads: Array<{ path: string; requestId: string; status: number; cacheControl: string; bytes: number; sha256: string }> = []
  const observerFailures: string[] = []
  let observerPending = 0
  let getObservations: { requests: number; reads: GetRead[]; pendingJobs: number; failures: string[]; signalsDetached: boolean } = { requests: 0, reads: [], pendingJobs: 0, failures: [], signalsDetached: false }
  let nodeGetRequests = 0
  const nodeGetTimeline: NodeGet[] = [], nodeGets = new WeakMap<PlaywrightRequest, NodeGet>()
  const publications: Array<Publication & { requestId: string }> = []
  const immutableReads: Array<{ stage: string; path: string; bytes: number; sha256: string }> = []
  const liveTargets: Array<{ stage: string; path: string; status: number; target: string }> = []
  const probes: Array<{ kind: string; path: string; status: number }> = []
  const observations: Record<string, unknown> = { viewportOnly: true, layout: [], publications, immutableReads, liveTargets, probes }
  const admitted = new WeakMap<PlaywrightRequest, { transition: string; target: string; action: boolean }>()
  const received = new WeakMap<PlaywrightRequest, { status: number; contentType: string; path: string | null; redirect: string | null }>()
  const cancellations: Array<{ transition: string; method: string; path: string; target: string; status: number; contentType: string; redirect: string | null }> = []
  function problem(key: keyof typeof counts, detail: unknown) {
    counts[key]++
    if (diagnostics.length < 32) diagnostics.push({ stage, kind: key, detail: bounded(detail) })
  }
  function pathOf(raw: string | undefined) {
    if (!raw) return null
    try { const url = new URL(raw.split(";")[0], ORIGIN); return url.origin === ORIGIN && !url.username && !url.password && !url.hash && authPages.has(url.pathname) && query(url, true) ? url.pathname : null }
    catch { return null }
  }
  function requestLabel(request: PlaywrightRequest) {
    const url = new URL(request.url())
    return request.method() + " " + (url.origin === ORIGIN ? url.pathname : "cross-origin") + " queryKeys=" + [...url.searchParams.keys()].sort().join(",")
  }
  const watched = new Set<Page>()
  function watchPage(observed: Page) {
    if (watched.has(observed)) return
    watched.add(observed)
    observed.on("pageerror", (error) => problem("pageErrors", error.message))
    observed.on("console", (message) => { if (message.type() === "error") problem("consoleErrors", message.text()) })
    observed.on("dialog", (dialog) => {
      problem("dialogs", dialog.type())
      const job = dialog.dismiss().catch((error) => { cleanupFailures.push(bounded(error)) }).finally(() => pending.delete(job))
      pending.add(job)
    })
  }
  async function guard(context: BrowserContext, anon: boolean) {
    let extraPageBudget = anon ? 1 : 0
    context.on("page", (opened) => { if (extraPageBudget-- <= 0) problem("unexpectedRequests", "Unexpected extra page"); watchPage(opened) })
    context.on("response", (response) => {
      const headers = response.headers()
      const get = nodeGets.get(response.request())
      if (get) { get.responseAt = Date.now(); get.status = response.status(); get.contentType = (headers["content-type"] ?? "").slice(0, 100) }
      received.set(response.request(), { status: response.status(), contentType: (headers["content-type"] ?? "").slice(0, 100), path: pathOf(response.url()), redirect: pathOf(headers["x-action-redirect"] ?? headers.location) })
      if (response.status() >= 400) problem("httpErrors", response.status() + " " + requestLabel(response.request()))
    })
    context.on("requestfailed", (request) => {
      const get = nodeGets.get(request)
      if (get) { get.requestfailedAt = Date.now(); get.errorText = bounded(request.failure()?.errorText ?? "unknown", 240) }
      const permission = admitted.get(request), response = received.get(request), url = new URL(request.url())
      const flight = !anon && request.method() === "GET" && url.searchParams.has("_rsc") && request.headers().rsc === "1"
      const stream = response?.status === 200 && response.contentType.startsWith("text/x-component")
      const match = permission && (permission.action ? response?.redirect === permission.target : response?.path === permission.target && url.pathname === permission.target)
      if (!anon && request.failure()?.errorText === "net::ERR_ABORTED" && permission && response && match
        && (permission.action ? stream || [303, 307, 308].includes(response.status) : flight && stream) && cancellations.length < 16) {
        cancellations.push({ transition: permission.transition, method: request.method(), path: url.pathname, target: permission.target, status: response.status, contentType: response.contentType, redirect: response.redirect })
      } else problem("requestFailures", requestLabel(request) + " " + (request.failure()?.errorText ?? "unknown") + " response=" + (response?.status ?? "none"))
    })
    context.on("requestfinished", (request) => {
      const get = nodeGets.get(request)
      if (get) get.requestfinishedAt = Date.now()
    })
    await context.routeWebSocket("**/*", (route) => {
      const url = new URL(route.url())
      if (!anon && url.protocol === "ws:" && url.host === "127.0.0.1:3100" && url.pathname === "/_next/webpack-hmr" && !url.username && !url.password && !url.hash && url.search.length <= 256) {
        developmentWebSockets++; route.connectToServer()
      } else { problem("unexpectedWebSockets", "Unapproved WebSocket"); route.close() }
    })
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname === "/api/events") problem("analyticsRequests", "Unexpected analytics request")
      if (url.origin !== ORIGIN || url.username || url.password || url.hash) { problem("unexpectedRequests", requestLabel(request)); await route.abort("blockedbyclient"); return }
      const read = ["GET", "HEAD"].includes(request.method())
      const staticRead = !anon && url.pathname.startsWith("/_next/static/") && !url.pathname.split("/").includes("..") && query(url)
      const allowedPage = anon ? publicPages.has(url.pathname) && !url.search : authPages.has(url.pathname) && query(url, true)
      if (read && (allowedPage || staticRead || (!anon && url.pathname === "/__nextjs_font/geist-latin.woff2" && !url.search) || (url.pathname === "/favicon.ico" && !url.search))) {
        if (!anon) admitted.set(request, { transition: stage, target: authTarget, action: false })
        allowedReads++; await route.continue(); return
      }
      if (!anon && read && url.pathname === publicationApi && !url.search) {
        if (request.method() === "GET") {
          nodeGetRequests++
          if (nodeGetTimeline.length >= 8) problem("requestFailures", "Publication GET timeline exceeded its bound")
          else {
            const observed: NodeGet = { ordinal: nodeGetRequests, path: url.pathname, startStage: stage, startedAt: Date.now(), responseAt: null, status: null, contentType: null, requestfinishedAt: null, requestfailedAt: null, errorText: null }
            nodeGets.set(request, observed); nodeGetTimeline.push(observed)
          }
        }
        allowedReads++; await route.continue(); return
      }
      if (!anon && request.method() === "POST" && !url.search && request.headers().origin === ORIGIN
        && /^application\/json(?:;|$)/.test(request.headers()["content-type"] ?? "") && (request.postDataBuffer()?.length ?? 0) <= 2 * 1024 * 1024
        && ((url.pathname === publicationApi && ["publish-1", "publish-2"].includes(stage)) || (url.pathname === DRAFT_API && stage === "save-2"))) {
        if (url.pathname === publicationApi) realPublishRequests++; else realSaveRequests++
        await route.continue(); return
      }
      if (!anon && request.method() === "POST" && url.pathname === postPath && !url.search && authPages.has(url.pathname) && request.headers().origin === ORIGIN
        && /^(multipart\/form-data;|application\/x-www-form-urlencoded(?:;|$)|text\/plain(?:;|$))/.test(request.headers()["content-type"] ?? "") && (request.postDataBuffer()?.length ?? 0) <= 32768) {
        admitted.set(request, { transition: stage, target: "/app", action: true }); allowedActions++; await route.continue(); return
      }
      problem("unexpectedRequests", requestLabel(request)); await route.abort("blockedbyclient")
    })
  }
  async function layout(observed: Page, name: string) {
    const size = await observed.evaluate(() => ({ viewport: innerWidth, content: window.document.documentElement.scrollWidth }))
    ;(observations.layout as unknown[]).push({ name, ...size })
    expect(size.content).toBeLessThanOrEqual(size.viewport + 1)
  }
  async function submit(buttonName: string, api: string) {
    const deadline = Date.now() + 10000, remaining = () => Math.max(1, deadline - Date.now())
    const [response] = await Promise.all([
      page.waitForResponse((response) => response.url() === ORIGIN + api && response.request().method() === "POST", { timeout: remaining() }),
      page.getByRole("button", { name: buttonName, exact: true }).click({ timeout: remaining() }),
    ])
    expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store")
    const payload = response.request().postDataJSON(), requestId = payload.requestId
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    await expect.poll(() => page.evaluate(({ key, requestId }) => {
      const state = (window as unknown as Record<string, ResponseObserver>)[key]
      return !state || state.failures.length ? "failed" : state.records[requestId] && state.jobs.size === 0 ? "ready" : "pending"
    }, { key: observerKey, requestId }), { timeout: remaining() }).toBe("ready")
    const observed = await page.evaluate(({ key, requestId }) => (window as unknown as Record<string, ResponseObserver>)[key].records[requestId], { key: observerKey, requestId })
    expect(observed.path).toBe(api); expect(observed.status).toBe(200); expect(observed.cacheControl).toContain("no-store")
    expect(observed.contentType).toMatch(/^application\/json(?:;|$)/)
    expect(observed.bytes).toBe(Buffer.byteLength(observed.body)); expect(observed.bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
    const ack = JSON.parse(observed.body)
    expect(ack.receipt.requestId).toBe(requestId)
    reads.push({ path: observed.path, requestId, status: observed.status, cacheControl: observed.cacheControl, bytes: observed.bytes, sha256: createHash("sha256").update(observed.body).digest("hex") })
    return { ack, payload }
  }
  async function publish(revision: number, title: string) {
    stage = "publish-" + revision; authTarget = savedPath
    const publisher = page.getByRole("region", { name: "Workspace publication", exact: true })
    await expect(publisher.getByRole("button", { name: "Publish saved revision", exact: true })).toBeEnabled()
    await publisher.getByRole("button", { name: "Publish saved revision", exact: true }).click()
    const confirmation = publisher.getByRole("group", { name: "Confirm public publication", exact: true })
    await expect(confirmation.getByText("Anyone with the public link can read this saved revision.", { exact: true })).toBeVisible()
    const { ack, payload } = await submit("Confirm publish", publicationApi)
    expect(ack.status).toBe("published"); expect(ack.receipt.status).toBe("published")
    expect(payload.expectedRevision).toBe(revision); expect(ack.receipt.acceptedRevision).toBe(revision)
    expect(ack.state.id).toBe(id); expect(ack.state.workspaceSlug).toBe("core-growth"); expect(ack.state.kind).toBe(kind)
    expect(ack.state.draftRevision).toBe(revision)
    const current: Publication = ack.state.current
    expect(current.publicId).toMatch(new RegExp("^" + kind + "_[0-9a-f]{32}$"))
    expect(current.versionId).toBe(payload.versionId); expect(ack.receipt.versionId).toBe(payload.versionId)
    expect(current.versionId).toMatch(/^[0-9a-f-]{36}$/); expect(current.sourceRevision).toBe(revision); expect(current.title).toBe(title)
    expect(current.documentHash).toBe(payload.expectedDraftHash); expect(ack.receipt.documentHash).toBe(current.documentHash)
    expect(current.artifactHash).toMatch(/^[0-9a-f]{64}$/)
    expect(ack.receipt.publication.versionId).toBe(current.versionId)
    const live = localUrl(current.publicUrl), version = localUrl(current.versionUrl)
    expect(live).toBe("/v/" + current.publicId); expect(version).toBe(live + "/" + current.versionId)
    publicPages.add(live); publicPages.add(version)
    await expect(publisher.getByRole("link", { name: "Open current public version", exact: true })).toHaveAttribute("href", current.publicUrl)
    await expect(publisher.getByRole("link", { name: "Open immutable published version", exact: true })).toHaveAttribute("href", current.versionUrl)
    publications.push({ ...current, requestId: payload.requestId }); completed.add(stage)
    return { current, live, version }
  }
  async function live(path: string, expected: string) {
    const response = await anonymous!.request.get(ORIGIN + path, { maxRedirects: 0, timeout: 10000 })
    try {
      expect(response.status()).toBe(307); expect(response.headers()["cache-control"]).toContain("no-store")
      const target = localUrl(response.headers().location)
      expect(target).toBe(expected)
      liveTargets.push({ stage, path, status: response.status(), target })
    } finally { await response.dispose() }
  }
  async function immutable(path: string) {
    const response = await anonymous!.request.get(ORIGIN + path, { maxRedirects: 0, timeout: 10000 })
    try {
      expect(response.status()).toBe(200)
      const headers = response.headers()
      expect(headers["content-type"]).toMatch(/^text\/html;\s*charset=utf-8$/i)
      expect(headers["cache-control"]).toBe("public, max-age=0, must-revalidate")
      expect(headers["x-content-type-options"]).toBe("nosniff"); expect(headers["referrer-policy"]).toBe("no-referrer")
      expect(headers["content-security-policy"]).toContain("connect-src 'none'")
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'")
      expect(headers["content-security-policy"]).toMatch(/sandbox[^;]*allow-scripts/); expect(headers["content-security-policy"]).toMatch(/sandbox[^;]*allow-same-origin/)
      if (headers["content-length"]) expect(Number(headers["content-length"])).toBeLessThanOrEqual(MAX_HTML)
      const body = await response.body(); expect(body.length).toBeGreaterThan(0); expect(body.length).toBeLessThanOrEqual(MAX_HTML)
      immutableReads.push({ stage, path, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") })
      return body
    } finally { await response.dispose() }
  }
  try {
    watchPage(page); await guard(auth, false)
    await installObserver(auth, observerKey, [DRAFT_API, publicationApi], publicationApi, id, kind)
    stage = "sign-in"; authTarget = WORKSPACE; postPath = "/auth"
    await page.goto("/auth", { waitUntil: "load" })
    await page.locator("#sign-in-email").fill("morgan@northstarlabs.com"); await page.locator("#sign-in-password").fill("demo1234")
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL(ORIGIN + WORKSPACE)
    await expect(page.getByRole("heading", { name: "Core Growth", level: 1, exact: true })).toBeVisible()
    await page.waitForLoadState("load")
    expect((await auth.cookies(ORIGIN)).find((cookie) => cookie.name === "slides_session")?.httpOnly).toBe(true)
    completed.add(stage); postPath = null
    stage = "private-seed"
    const seed = await auth.request.post(ORIGIN + DRAFT_API, { headers: { Origin: ORIGIN }, data: { id, requestId: seedRequestId, expectedRevision: 0, document }, timeout: 10000, maxRedirects: 0 })
    try {
      expect(seed.status()).toBe(200)
      const bytes = await seed.body(); expect(bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024)
      const ack = JSON.parse(bytes.toString("utf8"))
      expect(ack.status).toBe("saved"); expect(ack.receipt.requestId).toBe(seedRequestId)
      expect(ack.draft.id).toBe(id); expect(ack.draft.kind).toBe(kind); expect(ack.draft.draftRevision).toBe(1); expect(ack.draft.title).toBe(title1)
      observations.seed = { id, revision: ack.draft.draftRevision, documentHash: ack.draft.draftHash, requestId: seedRequestId, actualAuthenticatedRequest: true }
    } finally { await seed.dispose() }
    completed.add(stage)
    stage = "private-open"; authTarget = savedPath
    await page.goto(savedPath, { waitUntil: "load" })
    await expect(page.getByRole("heading", { name: title1, level: 1, exact: true })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 1\.$/ })).toBeVisible()
    completed.add(stage)
    anonymous = await browser.newContext({ baseURL: ORIGIN, viewport: info.project.use.viewport ?? { width: 390, height: 844 }, isMobile: false, hasTouch: false, storageState: { cookies: [], origins: [] }, serviceWorkers: "block", acceptDownloads: false })
    anonymous.setDefaultTimeout(10_000); anonymous.setDefaultNavigationTimeout(30_000)
    await guard(anonymous, true); publicPage = await anonymous.newPage()
    expect(await anonymous.cookies(ORIGIN)).toEqual([])
    const first = await publish(1, title1)
    stage = "public-reader"
    await live(first.live, first.version)
    const original = await immutable(first.version)
    await publicPage.goto(first.live, { waitUntil: "load" })
    await expect(publicPage).toHaveURL(ORIGIN + first.version)
    await expect(publicPage.getByRole("heading", { name: title1, level: 1, exact: true })).toBeVisible()
    await expect(publicPage.getByText(marker, { exact: true })).toBeVisible()
    if (kind === "course") {
      const quiz = publicPage.locator(".quiz").first()
      await quiz.getByRole("radio", { name: "A tangible win", exact: true }).check()
      await expect(quiz.getByRole("status")).toContainText("Correct.")
      const complete = publicPage.locator(".complete-lesson").first()
      await complete.click(); await expect(complete).toHaveAttribute("aria-pressed", "true")
      await publicPage.reload({ waitUntil: "load" })
      await expect(publicPage.locator(".complete-lesson").first()).toHaveAttribute("aria-pressed", "true")
      await expect(publicPage.locator(".quiz .feedback").first()).toBeHidden()
      observations.reader = { kind, feedbackCorrect: true, completionRestoredAfterReload: true, quizFeedbackReset: true }
    } else {
      await expect(publicPage.locator("img")).toHaveCount(0)
      observations.reader = { kind, literalMarkupVisible: true, noInjectedImage: true }
    }
    await layout(publicPage, "first-public-version"); completed.add(stage)
    stage = "unsaved-edit"
    await page.getByRole("button", { name: "Edit " + label, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Edit " + kind, exact: true })
    await dialog.getByLabel(kind === "course" ? "Title" : "Report title", { exact: true }).fill(title2)
    await dialog.getByRole("button", { name: "Apply changes", exact: true }).click(); await expect(dialog).toBeHidden()
    await expect(page.getByRole("heading", { name: title2, level: 1, exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Workspace publication", exact: true }).getByRole("button", { name: "Publish saved revision", exact: true })).toBeDisabled()
    expect(realPublishRequests).toBe(1)
    await live(first.live, first.version)
    expect((await immutable(first.version)).equals(original)).toBe(true)
    observations.unsavedPublicationBlocked = true; completed.add(stage)
    stage = "save-2"
    const saved = await submit("Save revision", DRAFT_API)
    expect(saved.ack.status).toBe("saved"); expect(saved.ack.draft.id).toBe(id); expect(saved.ack.draft.draftRevision).toBe(2)
    expect(saved.ack.draft.title).toBe(title2); expect(saved.ack.receipt.acceptedRevision).toBe(2)
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 2\.$/ })).toBeVisible()
    completed.add(stage)
    const second = await publish(2, title2)
    expect(second.current.publicId).toBe(first.current.publicId); expect(second.current.versionId).not.toBe(first.current.versionId)
    expect(publications[0].requestId).not.toBe(publications[1].requestId)
    stage = "final-proof"
    await live(second.live, second.version)
    await publicPage.goto(second.live, { waitUntil: "load" })
    await expect(publicPage).toHaveURL(ORIGIN + second.version)
    await expect(publicPage.getByRole("heading", { name: title2, level: 1, exact: true })).toBeVisible()
    if (kind === "course") {
      await expect(publicPage.locator(".complete-lesson").first()).toHaveAttribute("aria-pressed", "false")
      observations.newVersionInitiallyIncomplete = true
    }
    expect((await immutable(first.version)).equals(original)).toBe(true)
    await immutable(second.version)
    for (const [name, pathname] of [
      ["unknown-public", "/v/" + kind + "_" + randomUUID().replaceAll("-", "")],
      ["unknown-version", first.live + "/" + randomUUID()],
      ["reserved-private-namespace", "/files/canonical-publications/" + id + "/" + randomUUID() + "/" + "0".repeat(64) + ".json"],
      ["query-refusal", second.live + "?preview=true"],
    ]) {
      const response = await anonymous.request.get(ORIGIN + pathname, { maxRedirects: 0, timeout: 10000 })
      try { expect(response.status()).toBe(404); probes.push({ kind: name, path: pathname.split("?")[0], status: response.status() }) }
      finally { await response.dispose() }
    }
    expect(await anonymous.cookies(ORIGIN)).toEqual([])
    await layout(page, "publisher"); await layout(publicPage, "latest-public-version")
    expect(realPublishRequests).toBe(2); expect(realSaveRequests).toBe(1); expect(reads).toHaveLength(3)
    observations.anonymousCookiesAbsent = true; observations.originalVersionBytesUnchanged = true; observations.newLiveTitle = title2
    observations.reservedNamespaceProbeDoesNotClaimKnownStagedKey = true
    completed.add(stage); stage = "complete"
  } catch (error) { primary = error }
  finally {
    postPath = null
    try {
      const state = await page.locator("body").evaluate(async (_body, key) => {
        const state = (window as unknown as Record<string, ResponseObserver>)[key]
        if (!state) return { pending: 0, failures: ["observer-state-missing"], get: { requests: 0, reads: [], pendingJobs: 0, failures: ["observer-get-state-missing"], signalsDetached: false } }
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([Promise.allSettled([...state.jobs, ...state.getJobs]), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000) })]).finally(() => clearTimeout(timer))
        for (const stop of state.stopGets) stop()
        state.stopGets.length = 0
        return { pending: state.jobs.size, failures: state.failures.slice(0, 8), get: { requests: state.getRequests, reads: state.getReads, pendingJobs: state.getJobs.size, failures: state.getFailures.slice(0, 8), signalsDetached: true } }
      }, observerKey, { timeout: 1500 })
      observerPending = state.pending; observerFailures.push(...state.failures)
      getObservations = state.get
    } catch { observerFailures.push("observer-final-drain-failed") }
    if (observerPending || observerFailures.length) cleanupFailures.push("Real response observer did not close completely")
    if (getObservations.pendingJobs || getObservations.failures.length || !getObservations.signalsDetached) cleanupFailures.push("Publication GET observer did not close completely")
    if (anonymous) try { await anonymous.close(); contextsClosed++ } catch (error) { cleanupFailures.push(bounded(error)) }
    try { await auth.close(); contextsClosed++ } catch (error) { cleanupFailures.push(bounded(error)) }
    await Promise.allSettled([...pending]); await new Promise<void>((resolve) => setImmediate(resolve))
    if (nodeGetRequests !== getObservations.requests || nodeGetTimeline.some((row) => row.requestfinishedAt === null && row.requestfailedAt === null)) cleanupFailures.push("Publication GET observation counts or terminal request events are incomplete")
    for (const row of cancellations) if (primary || stage !== "complete" || !completed.has(row.transition) || observations.originalVersionBytesUnchanged !== true) problem("requestFailures", "Unproven cancellation " + row.method + " " + row.path + " " + row.transition)
    const report = { kind: "iv-workspace-publication-boundary", schemaVersion: 1, title: info.title, profile: info.project.name, documentKind: kind,
      stage, status: !primary && Object.values(counts).every((value) => value === 0) && contextsClosed === 2 && cleanupFailures.length === 0 ? "passed" : "failed",
      primaryError: primary ? bounded(primary instanceof Error ? primary.message : primary, 4096) : null,
      realPublishRequests, realSaveRequests, observations,
      responseObserver: { kind: "native-fetch-response-clone", maxResponseBytes: 5 * 1024 * 1024, reads, pendingJobs: observerPending, failures: observerFailures },
      publicationGetObserver: { kind: "native-fetch-publication-get-clone", maxBodyBytes: 131072, ...getObservations, nodeRequests: nodeGetRequests, nodeTimeline: nodeGetTimeline,
        nodePendingRequests: nodeGetTimeline.filter((row) => row.requestfinishedAt === null && row.requestfailedAt === null).length,
        correlation: "method-path-ordinal-and-time-only", exactFailedRequestBindingClaimed: false, snapshotBeforeContextClose: true },
      boundary: { counts, diagnostics, allowedReads, allowedActions, developmentWebSockets, navigationCancellationCount: cancellations.length, navigationCancellations: cancellations },
      cleanup: { contextsCreated: anonymous ? 2 : 1, contextsClosed, pendingJobs: pending.size, failures: cleanupFailures } }
    const bytes = Buffer.from(JSON.stringify(report))
    expect(bytes.length).toBeLessThanOrEqual(24576)
    await info.attach("iv-workspace-publication-boundary", { body: bytes, contentType: "application/json" })
    expect.soft(Object.values(counts)).toEqual(Array(8).fill(0)); expect.soft(cleanupFailures).toEqual([])
    expect.soft(contextsClosed).toBe(anonymous ? 2 : 1)
    if (primary) throw primary
  }
}

test("a Course publishes saved revisions to an anonymous live link while prior version bytes stay immutable", async ({ browser, page }, info) => {
  await journey("course", browser, page, info)
})
test("a Report publishes saved revisions to an anonymous live link while prior version bytes stay immutable", async ({ browser, page }, info) => {
  await journey("report", browser, page, info)
})
