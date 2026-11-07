import { createHash, randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page, type Request as BrowserRequest, type TestInfo } from "@playwright/test"
import { createStarterCourseDocument, createStarterReportDocument } from "../../packages/domain/fixtures"
import { canonicalSerialize } from "../../packages/domain/canonical"

const ORIGIN = "http://127.0.0.1:3100"
const HASH = /^[0-9a-f]{64}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_HTML = 8 * 1024 * 1024
type Kind = "course" | "report"
type ObjectProof = { key: string; bytes: number; sha256: string }
type Fixture = { email: string; password: string; workspaceId: string; workspaceSlug: string; workspaceName: string;
  homeWorkspaceId: string; homeWorkspaceSlug: string; homeWorkspaceName: string; homePath: string;
  slides: { id: string; publicId: string; title: string; editorPath: string; publicPath: string; source: ObjectProof & { url: string } };
  victim: ObjectProof & { url: string } }
type Publication = { publicId: string; versionId: string; sourceRevision: number; documentHash: string; artifactHash: string; title: string; publicUrl: string; versionUrl: string }
type CloneRead = { ordinal: number; path: string; method: string; requestId: string | null; startedAt: number; status: number | null; responseAt: number | null; eofAt: number | null; eof: boolean; bytes: number; sha256: string | null; body: string | null; cacheControl: string; contentType: string; error: string | null; signal: { present: boolean; initialAborted: boolean | null; abortedAtEOF: boolean | null; finalAborted: boolean | null } }
type CloneState = { documentId: string; reads: CloneRead[]; jobs: Set<Promise<void>>; failures: string[]; stops: Array<() => void> }
type NodeRead = { ordinal: number; path: string; method: string; stage: string; status: number | null; contentType: string; redirect: string | null; finished: boolean; failed: string | null }
type SlidesPublishRead = {
  index: number; stage: string; phase: string; waitLimitMs: number; events: Array<{ phase: string; at: number }>;
  request: null | { method: string; path: string; startedAt: number; actionSha256: string; payloadBytes: number; deckId: string; labelSha256: string; sourceSha256: string };
  response: null | { at: number; status: number; contentType: string };
  finishedAt: number | null; failedAt: number | null; failure: string | null; finishedResolvedAt: number | null;
  listenersRemoved: boolean; timerCleared: boolean;
}

function sha(body: Buffer | string) { return createHash("sha256").update(body).digest("hex") }
function clean(value: unknown, secrets: string[], maximum = 384) {
  let result = String(value)
  for (const secret of secrets) if (secret) result = result.split(secret).join("[private]")
  return result.replace(/https?:\/\/[^\s<>"']+/g, "[URL]").replace(/(?:sb_secret_|eyJ)[A-Za-z0-9_.-]+/g, "[private]").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum)
}
function local(raw: string) {
  const url = new URL(raw, ORIGIN)
  expect(url.origin).toBe(ORIGIN); expect(url.username + url.password + url.search + url.hash).toBe("")
  return url.pathname
}
async function body(response: APIResponse, maximum: number) {
  const bytes = await response.body()
  expect(bytes.length).toBeLessThanOrEqual(maximum)
  return bytes
}
async function ownedFixture(kind: Kind, profile: string): Promise<Fixture> {
  const root = process.env.IV_SUPABASE_APPLICATION_ROOT!, file = process.env.IV_SUPABASE_APP_FIXTURES!
  expect(root && file).toBeTruthy(); expect(path.isAbsolute(root)).toBe(true)
  const relative = path.relative(root, file)
  expect(relative && !relative.startsWith("..") && !path.isAbsolute(relative)).toBeTruthy()
  for (const entry of [root, file]) {
    const info = await lstat(entry)
    expect(info.isSymbolicLink()).toBe(false); expect(info.uid).toBe(process.getuid!()); expect(await realpath(entry)).toBe(entry)
  }
  const before = await lstat(file)
  expect(before.isFile()).toBe(true); expect(before.size).toBeLessThanOrEqual(256 * 1024); expect(before.mode & 0o077).toBe(0)
  const bytes = await readFile(file), after = await lstat(file)
  expect([after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs]).toEqual([before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs])
  let document: { schemaVersion: number; sourceCommit: string; appOrigin: string; cases: Record<string, Fixture> }
  try { document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }
  catch { throw new Error("The owned fixture metadata is invalid.") }
  expect(document.schemaVersion).toBe(1); expect(document.appOrigin).toBe(ORIGIN)
  expect(document.sourceCommit).toMatch(/^[0-9a-f]{40}$/)
  const fixture: Fixture = document.cases[`${kind}-${profile.replace(/-chromium$/, "")}`]
  expect(fixture).toBeTruthy()
  expect(fixture.email).toMatch(/@example\.test$/); expect(fixture.password.length).toBeGreaterThanOrEqual(12)
  expect(fixture.workspaceSlug).toMatch(/^[a-z0-9-]{1,64}$/)
  expect(fixture.homeWorkspaceSlug).toMatch(/^[a-z0-9-]{1,64}$/)
  expect(local(fixture.homePath)).toBe(`/app/workspaces/${fixture.homeWorkspaceSlug}`)
  expect(fixture.homeWorkspaceName.length).toBeGreaterThan(0); expect(fixture.homeWorkspaceName.length).toBeLessThanOrEqual(160)
  for (const value of [fixture.workspaceId, fixture.homeWorkspaceId]) expect(value).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
  if (kind === "report" && profile === "desktop-chromium") {
    expect(fixture.workspaceId).not.toBe(fixture.homeWorkspaceId)
    expect(fixture.homeWorkspaceSlug).toBe("hq"); expect(fixture.workspaceSlug).toBe("secondary-reports")
    expect(fixture.workspaceName).toBe("Secondary reports")
  } else {
    expect(fixture.workspaceId).toBe(fixture.homeWorkspaceId); expect(fixture.workspaceSlug).toBe(fixture.homeWorkspaceSlug)
  }
  for (const value of [fixture.slides.id, fixture.slides.publicId]) expect(value).toMatch(/^[A-Za-z0-9_-]{1,128}$/)
  expect(local(fixture.slides.editorPath)).toBe(`/app/workspaces/${fixture.workspaceSlug}/decks/${fixture.slides.id}`)
  expect(local(fixture.slides.publicPath)).toMatch(/^\/d\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/)
  for (const proof of [fixture.slides.source, fixture.victim]) {
    expect(proof.sha256).toMatch(HASH); expect(proof.bytes).toBeGreaterThan(0); expect(proof.bytes).toBeLessThanOrEqual(1024 * 1024)
    expect(proof.url).toBe(`/files/${proof.key}`)
  }
  return fixture
}

async function installClones(context: BrowserContext, key: string, prefix: string) {
  await context.addInitScript(({ key, origin, prefix }) => {
    const state: CloneState = { documentId: crypto.randomUUID(), reads: [], jobs: new Set(), failures: [], stops: [] }
    Object.defineProperty(window, key, { value: state })
    const original = window.fetch
    window.fetch = function (this: unknown, ...args: Parameters<typeof window.fetch>) {
      const [input, init] = args
      let observed: CloneRead | null = null
      try {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
        if (url.origin === origin && !url.search && !url.hash && !url.username && !url.password
          && ((url.pathname === prefix || url.pathname.startsWith(prefix + "/")) && ["GET", "POST"].includes(method) || url.pathname === "/api/uploads" && method === "POST")) {
          if (state.reads.length >= 32) throw new Error("observer-count")
          const signal = init?.signal ?? (input instanceof Request ? input.signal : null)
          let requestId: string | null = null
          if (typeof init?.body === "string") { const value = JSON.parse(init.body); requestId = typeof value.requestId === "string" ? value.requestId : null }
          const row: CloneRead = { ordinal: state.reads.length + 1, path: url.pathname, method, requestId, startedAt: Date.now(), status: null, responseAt: null, eofAt: null, eof: false, bytes: 0, sha256: null, body: null, cacheControl: "", contentType: "", error: null,
            signal: { present: signal !== null, initialAborted: signal?.aborted ?? null, abortedAtEOF: null, finalAborted: null } }
          observed = row; state.reads.push(row)
          if (signal) state.stops.push(() => { row.signal.finalAborted = signal.aborted })
        }
      } catch { state.failures.push("observer-request") }
      const result = Reflect.apply(original, this, args) as Promise<Response>
      if (observed) {
        const row = observed, signal = init?.signal ?? (input instanceof Request ? input.signal : null)
        const job = result.then(async (response) => {
          row.responseAt = Date.now(); row.status = response.status
          row.cacheControl = response.headers.get("cache-control") ?? ""; row.contentType = response.headers.get("content-type") ?? ""
          const reader = response.clone().body?.getReader()
          if (!reader) throw new Error("observer-body-missing")
          const chunks: Uint8Array[] = [], deadline = Date.now() + 10000
          let bytes = 0
          try {
            while (true) {
              let timer: ReturnType<typeof setTimeout> | undefined
              const part = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("observer-body-timeout")), Math.max(1, deadline - Date.now())) })]).finally(() => clearTimeout(timer))
              if (part.done) break
              bytes += part.value.byteLength
              if (bytes > (row.method === "GET" ? 131072 : 5 * 1024 * 1024)) throw new Error("observer-body-overflow")
              chunks.push(part.value)
            }
            const joined = new Uint8Array(bytes)
            let offset = 0
            for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
            row.body = new TextDecoder("utf-8", { fatal: true }).decode(joined)
            row.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", joined)), (byte) => byte.toString(16).padStart(2, "0")).join("")
            row.eof = true; row.eofAt = Date.now(); row.bytes = bytes; row.signal.abortedAtEOF = signal?.aborted ?? null
          } catch (error) { void reader.cancel().catch(() => {}); throw error }
          finally { reader.releaseLock() }
        }).catch(() => { row.error = "response-clone-failed"; state.failures.push(row.error) }).finally(() => state.jobs.delete(job))
        state.jobs.add(job)
      }
      return result
    }
  }, { key, origin: ORIGIN, prefix })
}

async function journey(kind: Kind, browser: Browser, page: Page, info: TestInfo) {
  const fixture = await ownedFixture(kind, info.project.name), caseKey = `${kind}-${info.project.name.replace(/-chromium$/, "")}`
  const password = fixture.password, secrets = [fixture.password, fixture.email]
  const helperEnvironment = { ...process.env }
  delete helperEnvironment.FORCE_COLOR
  const workspace = `/app/workspaces/${fixture.workspaceSlug}`, draftApi = `/api/workspaces/${fixture.workspaceSlug}/visualizations`
  const id = randomUUID(), savedPath = `${workspace}/visualizations/${id}`, publicationApi = `${draftApi}/${id}/publications`, unpublishApi = publicationApi + "/unpublish"
  const observerKey = "iv_supabase_observer_" + randomUUID().replaceAll("-", ""), label = kind === "course" ? "Course" : "Report"
  const titles = [1, 2, 3].map((revision) => `Authored ${label} ${info.project.name} revision ${revision} ${id.slice(0, 8)}`)
  const document = kind === "course" ? createStarterCourseDocument() : createStarterReportDocument()
  document.title = titles[0]; document.seo.title = titles[0]
  const marker = kind === "course" ? "Authored Supabase Course explanation." : 'Authored Report text <img src="https://example.invalid/must-not-load">.'
  if (document.kind === "course") document.course.modules[0].lessons[0].explanation = marker
  else document.summary = marker
  const auth = page.context(), contexts: BrowserContext[] = [auth]
  const pages = new Set(["/", "/auth", "/app", fixture.homePath, workspace, savedPath, fixture.slides.editorPath])
  const publicPages = new Set<string>(), legacyVersions = new Set<string>(), completed = new Set<string>()
  let stage = "setup", target = "/auth", actionPath: string | null = null, primary: unknown
  let publicContext: BrowserContext | undefined, publicPage: Page | undefined
  let contextsClosed = 0, allowedReads = 0, allowedActions = 0, uploads = 0, slidesEvents = 0, developmentWebSockets = 0
  const counts = { unexpectedRequests: 0, unexpectedWebSockets: 0, requestFailures: 0, httpErrors: 0, pageErrors: 0, consoleErrors: 0, dialogs: 0, canonicalAnalytics: 0 }
  const diagnostics: Array<{ stage: string; kind: string; detail: string }> = [], pending = new Set<Promise<void>>()
  const cleanupFailures: string[] = [], cloneSnapshots: Array<Record<string, unknown>> = [], nodeReads: NodeRead[] = []
  const requests = new WeakMap<BrowserRequest, NodeRead>(), permissions = new WeakMap<BrowserRequest, { target: string; stage: string; action: boolean }>()
  const cancellations: Array<{ stage: string; method: string; path: string; status: number; contentType: string; redirect: string | null; target: string }> = []
  const publications: Publication[] = [], snapshots: Array<Record<string, unknown>> = [], negatives: Array<Record<string, unknown>> = []
  const slidesPublishDiagnostics: SlidesPublishRead[] = []
  const responseProofs: Array<Record<string, unknown>> = [], observations: Record<string, unknown> = { layout: [], publications, snapshots, negatives, responseProofs }
  observations.slidesPublishDiagnostics = slidesPublishDiagnostics
  function problem(key: keyof typeof counts, detail: unknown) {
    counts[key]++; if (diagnostics.length < 32) diagnostics.push({ stage, kind: key, detail: clean(detail, secrets) })
  }
  function query(url: URL, pageRead: boolean) {
    if (url.search.length > 256) return false
    const keys = new Set<string>()
    for (const [key, value] of url.searchParams) {
      if (keys.has(key)) return false
      keys.add(key)
      if (pageRead && key === "_rsc" && /^[A-Za-z0-9_-]{1,128}$/.test(value)) continue
      if (pageRead && url.pathname === "/auth" && key === "returnTo" && value === "/app") continue
      if (pageRead && url.pathname === "/auth" && key === "mode" && ["signin", "signup"].includes(value)) continue
      if (!pageRead && key === "v" && /^[0-9]{1,20}$/.test(value)) continue
      return false
    }
    return true
  }
  function watch(observed: Page) {
    observed.on("pageerror", (error) => problem("pageErrors", error.message))
    observed.on("console", (message) => { if (message.type() === "error") problem("consoleErrors", message.text()) })
    observed.on("dialog", (dialog) => {
      problem("dialogs", dialog.type())
      const job = dialog.dismiss().catch(() => { cleanupFailures.push("Unexpected dialog did not close") }).finally(() => pending.delete(job))
      pending.add(job)
    })
  }
  async function guard(context: BrowserContext, owner: boolean) {
    context.on("page", watch)
    context.on("request", (request) => {
      const url = new URL(request.url())
      if (url.origin === ORIGIN && url.pathname.startsWith(draftApi)) {
        if (nodeReads.length >= 64) { problem("requestFailures", "API request observation bound"); return }
        const row: NodeRead = { ordinal: nodeReads.length + 1, path: url.pathname, method: request.method(), stage, status: null, contentType: "", redirect: null, finished: false, failed: null }
        nodeReads.push(row); requests.set(request, row)
      }
    })
    context.on("response", (response) => {
      const row = requests.get(response.request()), headers = response.headers()
      if (row) { row.status = response.status(); row.contentType = headers["content-type"] ?? "" }
      const permission = permissions.get(response.request())
      if (permission) {
        const status: NodeRead = { ordinal: 0, path: new URL(response.url()).pathname, method: response.request().method(), stage: permission.stage, status: response.status(), contentType: headers["content-type"] ?? "", redirect: headers["x-action-redirect"]?.split(";")[0] ?? headers.location ?? null, finished: false, failed: null }
        received.set(response.request(), status)
      }
      if (response.status() >= 400) problem("httpErrors", `${response.status()} ${new URL(response.url()).pathname}`)
    })
    context.on("requestfinished", (request) => { const row = requests.get(request); if (row) row.finished = true })
    context.on("requestfailed", (request) => {
      const row = requests.get(request), error = request.failure()?.errorText ?? "unknown", url = new URL(request.url())
      if (row) row.failed = clean(error, secrets)
      const permission = permissions.get(request), response = received.get(request)
      const flight = request.method() === "GET" && url.searchParams.has("_rsc") && request.headers().rsc === "1"
      const stream = response?.status === 200 && response.contentType.startsWith("text/x-component")
      const matches = permission && (permission.action ? response?.redirect === permission.target : response?.path === permission.target && url.pathname === permission.target)
      if (error === "net::ERR_ABORTED" && permission && response && matches && cancellations.length < 32
        && (permission.action ? stream || [303, 307, 308].includes(response.status!) : flight && stream)) {
        cancellations.push({ stage: permission.stage, method: request.method(), path: url.pathname, status: response.status!, contentType: response.contentType, redirect: response.redirect, target: permission.target })
      } else problem("requestFailures", `${request.method()} ${url.pathname} ${error} response=${row?.status ?? response?.status ?? "none"}`)
    })
    await context.routeWebSocket("**/*", (route) => {
      const url = new URL(route.url())
      if (owner && url.protocol === "ws:" && url.host === "127.0.0.1:3100" && url.pathname === "/_next/webpack-hmr" && !url.username && !url.password && !url.hash && url.search.length <= 256) {
        developmentWebSockets++; route.connectToServer()
      } else { problem("unexpectedWebSockets", "Unapproved WebSocket"); route.close() }
    })
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url()), method = request.method(), headers = request.headers()
      if (url.origin !== ORIGIN || url.username || url.password || url.hash) { problem("unexpectedRequests", "Cross-origin or credentialed request"); await route.abort("blockedbyclient"); return }
      const read = ["GET", "HEAD"].includes(method)
      const staticRead = (url.pathname.startsWith("/_next/static/") && !url.pathname.split("/").includes("..") && query(url, false))
        || url.pathname === "/__nextjs_font/geist-latin.woff2" && !url.search || url.pathname === "/favicon.ico" && !url.search
      if (read && (staticRead || owner && pages.has(url.pathname) && query(url, true) || publicPages.has(url.pathname) && query(url, true))) {
        if (owner) permissions.set(request, { target, stage, action: false })
        allowedReads++; await route.continue(); return
      }
      if (owner && method === "GET" && [draftApi, `${draftApi}/${id}`, publicationApi].includes(url.pathname) && !url.search) { allowedReads++; await route.continue(); return }
      if (owner && method === "POST" && !url.search && headers.origin === ORIGIN
        && /^application\/json(?:;|$)/.test(headers["content-type"] ?? "") && (request.postDataBuffer()?.length ?? Infinity) <= 2 * 1024 * 1024
        && (url.pathname === draftApi && stage.startsWith("save-") || url.pathname === publicationApi && stage.startsWith("publish-") || url.pathname === unpublishApi && stage === "unpublish")) {
        await route.continue(); return
      }
      if (owner && method === "POST" && url.pathname === "/api/uploads" && !url.search && stage === "slides-upload"
        && headers.origin === ORIGIN && /^multipart\/form-data;/.test(headers["content-type"] ?? "") && (request.postDataBuffer()?.length ?? Infinity) < 1024 * 1024) {
        uploads++; await route.continue(); return
      }
      if (method === "POST" && url.pathname === "/api/events" && !url.search) {
        let value: Record<string, unknown> | undefined
        try { value = request.postDataJSON() } catch { /* An invalid body is refused below. */ }
        const allowed = stage.startsWith("slides-") && value?.publicId === fixture.slides.publicId && typeof value.versionId === "string" && legacyVersions.has(value.versionId)
          && ["view", "slide_view", "session_end", "deck_complete"].includes(String(value.type)) && (request.postDataBuffer()?.length ?? Infinity) <= 4096
        if (allowed) { slidesEvents++; await route.continue(); return }
        problem("canonicalAnalytics", "Analytics outside the owned Slides frame"); await route.abort("blockedbyclient"); return
      }
      if (method === "POST" && url.pathname === actionPath && !url.search && headers.origin === ORIGIN && (owner || stage.startsWith("slides-password"))
        && /^(text\/plain(?:;|$)|multipart\/form-data;|application\/x-www-form-urlencoded(?:;|$))/.test(headers["content-type"] ?? "") && (request.postDataBuffer()?.length ?? Infinity) <= 1024 * 1024) {
        permissions.set(request, { target: stage === "sign-in" || stage === "fresh-sign-in" ? "/app" : stage === "sign-out" ? "/" : target, stage, action: true })
        allowedActions++; await route.continue(); return
      }
      problem("unexpectedRequests", `${method} ${url.pathname} queryKeys=${[...url.searchParams.keys()].sort().join(",")}`)
      await route.abort("blockedbyclient")
    })
  }
  const received = new WeakMap<BrowserRequest, NodeRead>()
  async function context() {
    const selected = await browser.newContext({ baseURL: ORIGIN, viewport: info.project.use.viewport, isMobile: false, hasTouch: false, storageState: { cookies: [], origins: [] }, serviceWorkers: "block", acceptDownloads: false })
    contexts.push(selected); selected.setDefaultTimeout(10000); selected.setDefaultNavigationTimeout(30000)
    await guard(selected, false)
    return selected
  }
  async function layout(observed: Page, name: string) {
    const size = await observed.evaluate(() => ({ viewport: innerWidth, width: Math.max(globalThis.document.documentElement.scrollWidth, globalThis.document.body.scrollWidth) }))
    ;(observations.layout as unknown[]).push({ name, ...size }); expect(size.width).toBeLessThanOrEqual(size.viewport + 1)
  }
  async function drain() {
    const snapshot = await page.evaluate(async (key) => {
      const state = (window as unknown as Record<string, CloneState>)[key]
      if (!state) throw new Error("Observer missing")
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([Promise.allSettled([...state.jobs]), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000) })]).finally(() => clearTimeout(timer))
      for (const stop of state.stops) stop()
      state.stops.length = 0
      return { documentId: state.documentId, stage: "", pending: state.jobs.size, failures: state.failures,
        reads: state.reads.map(({ body: _body, ...row }) => row) }
    }, observerKey)
    snapshot.stage = stage
    expect(snapshot.pending).toBe(0); expect(snapshot.failures).toEqual([])
    for (const row of snapshot.reads) { expect(row.eof).toBe(true); expect(row.error).toBeNull(); expect(row.sha256).toMatch(HASH); expect(row.status).toBe(200) }
    const index = cloneSnapshots.findIndex((row) => row.documentId === snapshot.documentId)
    if (index >= 0) cloneSnapshots[index] = snapshot
    else { expect(cloneSnapshots.length).toBeLessThan(12); cloneSnapshots.push(snapshot) }
  }
  async function submit(name: string, endpoint: string) {
    const deadline = Date.now() + 10000, remaining = () => Math.max(1, deadline - Date.now())
    const [request] = await Promise.all([page.waitForRequest((request) => request.url() === ORIGIN + endpoint && request.method() === "POST", { timeout: remaining() }), page.getByRole("button", { name, exact: true }).click()])
    const payload = request.postDataJSON()
    expect(payload.requestId).toMatch(UUID)
    await expect.poll(() => page.evaluate(({ key, requestId }) => {
      const state = (window as unknown as Record<string, CloneState>)[key]
      return state.failures.length ? "failed" : state.reads.some((row) => row.requestId === requestId && row.eof) && state.jobs.size === 0 ? "ready" : "pending"
    }, { key: observerKey, requestId: payload.requestId }), { timeout: remaining() }).toBe("ready")
    const row = await page.evaluate(({ key, requestId }) => (window as unknown as Record<string, CloneState>)[key].reads.find((row) => row.requestId === requestId)!, { key: observerKey, requestId: payload.requestId })
    expect(row.status).toBe(200); expect(row.path).toBe(endpoint); expect(row.contentType).toMatch(/^application\/json(?:;|$)/)
    expect(row.cacheControl).toContain("no-store"); expect(row.eof).toBe(true); expect(sha(row.body!)).toBe(row.sha256)
    const ack = JSON.parse(row.body!); expect(ack.receipt.requestId).toBe(payload.requestId)
    responseProofs.push({ path: endpoint, requestId: payload.requestId, bytes: row.bytes, sha256: row.sha256, status: row.status })
    return { ack, payload }
  }
  async function snapshot(type: "canonical" | "slides", versionId?: string) {
    const args = ["--import", "tsx", "scripts/supabase-application-fixture.ts", "snapshot", "--case", caseKey, "--kind", type]
    if (versionId) args.push("--version-id", versionId)
    const result = await promisify(execFile)(process.execPath, args, { cwd: process.cwd(), env: helperEnvironment, encoding: "utf8", timeout: 20000, maxBuffer: 256 * 1024 })
    expect(result.stderr).toBe("")
    const value = JSON.parse(result.stdout)
    if (type === "canonical") {
      expect(value.versionId).toBe(versionId); expect(value.publicId).toMatch(new RegExp(`^${kind}_[0-9a-f]{32}$`))
      expect(value.key).toMatch(new RegExp(`^canonical-publications/${id}/${versionId}/[0-9a-f]{64}\\.json$`))
      expect(value.sha256).toMatch(HASH); expect(value.bytes).toBeGreaterThan(0); expect(value.bytes).toBeLessThanOrEqual(24 * 1024 * 1024)
    } else {
      expect(value.deck.id).toBe(fixture.slides.id); expect(value.deck.publicId).toBe(fixture.slides.publicId)
      expect(Array.isArray(value.versions)).toBe(true); expect(Array.isArray(value.assets)).toBe(true)
      for (const row of value.versions) { expect(row.id).toMatch(/^[A-Za-z0-9_-]{1,128}$/); expect(row.artifact.sha256).toMatch(HASH); expect(row.artifact.bytes).toBeGreaterThan(0) }
    }
    snapshots.push({ stage, kind: type, ...value })
    return value
  }
  async function edit(title: string) {
    await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: `Edit ${kind}`, exact: true })
    await dialog.getByLabel(kind === "course" ? "Title" : "Report title", { exact: true }).fill(title)
    await dialog.getByRole("button", { name: "Apply changes", exact: true }).click()
    await expect(dialog).toBeHidden(); await expect(page.getByRole("heading", { name: title, level: 1, exact: true })).toBeVisible()
  }
  const publisher = page.getByRole("region", { name: "Workspace publication", exact: true })
  async function ready(requirePublish = true) {
    const deadline = Date.now() + 10000
    await expect(publisher).toHaveAttribute("aria-busy", "false", { timeout: Math.max(1, deadline - Date.now()) })
    if (requirePublish) await expect(publisher.getByRole("button", { name: "Publish saved revision", exact: true })).toBeEnabled({ timeout: Math.max(1, deadline - Date.now()) })
    await drain()
  }
  async function save(revision: number) {
    stage = `save-${revision}`
    const { ack, payload } = await submit("Save revision", draftApi)
    expect(ack.status).toBe("saved"); expect(ack.draft.id).toBe(id); expect(ack.draft.kind).toBe(kind)
    expect(ack.draft.draftRevision).toBe(revision); expect(ack.draft.title).toBe(titles[revision - 1])
    expect(payload.expectedRevision).toBe(revision - 1); expect(ack.receipt.acceptedRevision).toBe(revision)
    await expect(page.getByRole("status").filter({ hasText: new RegExp(`^Saved revision ${revision}\\.$`) })).toBeVisible()
    await ready(); completed.add(stage)
  }
  async function publish(revision: number) {
    stage = `publish-${revision}`; target = savedPath
    await ready()
    await publisher.getByRole("button", { name: "Publish saved revision", exact: true }).click()
    const confirmation = publisher.getByRole("group", { name: "Confirm public publication", exact: true })
    await expect(confirmation.getByText("Anyone with the public link can read this saved revision.", { exact: true })).toBeVisible()
    const { ack, payload } = await submit("Confirm publish", publicationApi)
    expect(ack.status).toBe("published"); expect(ack.receipt.status).toBe("published"); expect(ack.state.id).toBe(id)
    expect(ack.state.kind).toBe(kind); expect(ack.state.workspaceSlug).toBe(fixture.workspaceSlug)
    const current: Publication = ack.state.current
    expect(current.publicId).toMatch(new RegExp(`^${kind}_[0-9a-f]{32}$`)); expect(current.versionId).toBe(payload.versionId)
    expect(current.sourceRevision).toBe(revision); expect(current.title).toBe(titles[revision - 1]); expect(current.documentHash).toBe(payload.expectedDraftHash)
    expect(ack.receipt.acceptedRevision).toBe(revision); expect(ack.receipt.publication.versionId).toBe(current.versionId)
    expect(local(current.publicUrl)).toBe(`/v/${current.publicId}`); expect(local(current.versionUrl)).toBe(`${current.publicUrl}/${current.versionId}`)
    for (const pathname of [current.publicUrl, current.versionUrl]) publicPages.add(pathname)
    publications.push(current); await drain(); completed.add(stage)
    return current
  }
  async function http(context: BrowserContext, pathname: string, expected: number, method = "GET", headers: Record<string, string> = {}, maximum = MAX_HTML) {
    const response = await context.request.fetch(ORIGIN + local(pathname), { method, headers, maxRedirects: 0, timeout: 10000 })
    try {
      expect(response.status()).toBe(expected)
      const bytes = await body(response, maximum)
      if (method === "HEAD") expect(bytes.length).toBe(0)
      return { bytes, headers: response.headers() }
    } finally { await response.dispose() }
  }
  async function canonicalHtml(publication: Publication) {
    const redirect = await http(publicContext!, publication.publicUrl, 307)
    expect(local(redirect.headers.location)).toBe(publication.versionUrl); expect(redirect.headers["cache-control"]).toContain("no-store")
    const result = await http(publicContext!, publication.versionUrl, 200)
    expect(result.headers["content-security-policy"]).toContain("connect-src 'none'")
    expect(result.headers["content-security-policy"]).toContain("frame-ancestors 'none'")
    expect(result.headers["x-content-type-options"]).toBe("nosniff"); expect(result.headers["referrer-policy"]).toBe("no-referrer")
    expect(sha(JSON.stringify(result.bytes.toString("utf8")))).toBe(publication.artifactHash)
    return result.bytes
  }
  async function refused(paths: string[], etag: string) {
    for (const pathname of paths) for (const method of ["GET", "HEAD"]) for (const conditional of [false, true]) {
      const result = await http(publicContext!, pathname, 404, method, conditional ? { "If-None-Match": etag } : {}, 4096)
      expect(result.headers["cache-control"]).toBe("private, no-store")
      negatives.push({ stage, path: pathname, method, conditional, status: 404, bytes: result.bytes.length, sha256: sha(result.bytes) })
    }
  }
  async function signIn(fresh: boolean) {
    stage = fresh ? "fresh-sign-in" : "sign-in"; actionPath = "/auth"; target = fixture.homePath
    await page.goto("/auth", { waitUntil: "load" })
    await page.locator("#sign-in-email").fill(fixture.email); await page.locator("#sign-in-password").fill(fixture.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL(ORIGIN + fixture.homePath); await page.waitForLoadState("load")
    await expect(page.getByRole("heading", { name: fixture.homeWorkspaceName, level: 1, exact: true })).toBeVisible()
    if (fixture.homePath !== workspace) {
      target = workspace
      await page.goto(workspace, { waitUntil: "load" })
    }
    await expect(page).toHaveURL(ORIGIN + workspace)
    await expect(page.getByRole("heading", { name: fixture.workspaceName, level: 1, exact: true })).toBeVisible()
    const cookie = (await auth.cookies(ORIGIN)).find((value) => value.name === "slides_session")
    expect(cookie?.httpOnly).toBe(true)
    actionPath = null; completed.add(stage)
  }
  try {
    watch(page); await guard(auth, true); await installClones(auth, observerKey, draftApi)
    await signIn(false)
    stage = "save-1"
    const seedRequestId = randomUUID(), response = await auth.request.post(ORIGIN + draftApi, { headers: { Origin: ORIGIN }, data: { id, requestId: seedRequestId, expectedRevision: 0, document }, timeout: 10000, maxRedirects: 0 })
    try {
      expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store")
      const ack = JSON.parse((await body(response, 3 * 1024 * 1024)).toString("utf8"))
      expect(ack.status).toBe("saved"); expect(ack.draft.id).toBe(id); expect(ack.draft.kind).toBe(kind); expect(ack.draft.draftRevision).toBe(1)
      expect(ack.receipt.requestId).toBe(seedRequestId); expect(ack.draft.draftHash).toMatch(HASH)
      expect(ack.receipt.acceptedRevision).toBe(1); expect(ack.draft.workspaceSlug).toBe(fixture.workspaceSlug)
      expect(ack.draft.draftHash).toBe(sha(canonicalSerialize(document)))
      observations.initialSave = { id, revision: 1, requestId: seedRequestId, documentHash: ack.draft.draftHash }
    } finally { await response.dispose() }
    completed.add(stage)
    stage = "private-open"; target = savedPath
    await page.goto(savedPath, { waitUntil: "load" }); await expect(page.getByRole("heading", { name: titles[0], level: 1, exact: true })).toBeVisible()
    await ready(); await page.reload({ waitUntil: "load" }); await ready()
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 1\.$/ })).toBeVisible(); completed.add(stage)
    await edit(titles[1]); await save(2)
    publicContext = await context(); publicPage = await publicContext.newPage()
    const first = await publish(2), firstHtml = await canonicalHtml(first), firstObject = await snapshot("canonical", first.versionId)
    stage = "public-runtime"
    await publicPage.goto(first.publicUrl, { waitUntil: "load" }); await expect(publicPage).toHaveURL(ORIGIN + first.versionUrl)
    await expect(publicPage.getByRole("heading", { name: titles[1], level: 1, exact: true })).toBeVisible()
    if (kind === "course") {
      await expect(publicPage.getByText(marker, { exact: true })).toBeVisible()
      const quiz = publicPage.locator(".quiz").first()
      await quiz.getByLabel("A tangible win", { exact: true }).check()
      await expect(quiz.getByRole("status")).toContainText("Correct.")
      await publicPage.getByRole("button", { name: "Mark complete", exact: true }).first().click()
      await publicPage.reload({ waitUntil: "load" })
      await expect(publicPage.getByRole("button", { name: "Completed", exact: true }).first()).toHaveAttribute("aria-pressed", "true")
      observations.courseLocalProgressRetained = true
    } else {
      await expect(publicPage.getByText(marker, { exact: true })).toBeVisible()
      await expect(publicPage.locator('img[src="https://example.invalid/must-not-load"]')).toHaveCount(0)
      observations.reportTextEscaped = true
    }
    await layout(publicPage, "canonical-public"); completed.add(stage)
    stage = "working-edit"; await edit(titles[2])
    await expect(publisher.getByRole("button", { name: "Publish saved revision", exact: true })).toBeDisabled()
    await expect(publisher.getByRole("button", { name: "Unpublish", exact: true })).toBeEnabled(); completed.add(stage)
    stage = "unpublish"
    await publisher.getByRole("button", { name: "Unpublish", exact: true }).click()
    const confirmation = publisher.getByRole("group", { name: "Confirm unpublish", exact: true })
    await expect(confirmation.getByText("Unpublish stops new requests to the live link and every existing version URL.", { exact: true })).toBeVisible()
    await expect(confirmation.getByText("Already-open pages, requests admitted before revocation, and copied or downloaded content cannot be recalled.", { exact: true })).toBeVisible()
    const unpublish = await submit("Confirm unpublish", unpublishApi)
    expect(unpublish.payload.expectedCurrentVersionId).toBe(first.versionId); expect(unpublish.ack.status).toBe("unpublished")
    expect(unpublish.ack.receipt.status).toBe("unpublished"); expect(unpublish.ack.state.current).toBeNull(); expect(unpublish.ack.state.draftRevision).toBe(2)
    await expect(page.getByRole("heading", { name: titles[2], level: 1, exact: true })).toBeVisible()
    await expect(page.getByText("Changes in this tab have not been saved to the workspace.", { exact: true })).toBeVisible()
    observations.workingEditsRetained = true; await ready(false); completed.add(stage)
    stage = "revocation-proof"
    await refused([first.publicUrl, first.versionUrl], '"' + sha(firstHtml) + '"')
    const retained = await snapshot("canonical", first.versionId)
    expect({ key: retained.key, bytes: retained.bytes, sha256: retained.sha256 }).toEqual({ key: firstObject.key, bytes: firstObject.bytes, sha256: firstObject.sha256 })
    await page.getByRole("button", { name: "Reload saved draft", exact: true }).click()
    const reload = page.getByRole("alert").filter({ has: page.getByRole("button", { name: "Keep editing", exact: true }) })
    await expect(reload.getByRole("button", { name: "Discard and reload", exact: true })).toBeVisible()
    await reload.getByRole("button", { name: "Keep editing", exact: true }).click(); await expect(reload).toBeHidden()
    await expect(page.getByRole("heading", { name: titles[2], level: 1, exact: true })).toBeVisible(); completed.add(stage)
    await save(3)
    stage = "private-reload"; await page.reload({ waitUntil: "load" }); await ready()
    await expect(page.getByRole("heading", { name: titles[2], level: 1, exact: true })).toBeVisible(); completed.add(stage)
    const second = await publish(3)
    expect(second.publicId).toBe(first.publicId); expect(second.versionId).not.toBe(first.versionId)
    stage = "republished-proof"; await canonicalHtml(second); await snapshot("canonical", second.versionId)
    await refused([first.versionUrl], '"' + sha(firstHtml) + '"')
    const finalOld = await snapshot("canonical", first.versionId)
    expect([finalOld.key, finalOld.bytes, finalOld.sha256]).toEqual([firstObject.key, firstObject.bytes, firstObject.sha256])
    observations.oldVersionStaysRevoked = true; await layout(page, "canonical-private"); completed.add(stage)

    stage = "slides-open"; target = fixture.slides.editorPath; await drain()
    await page.goto(fixture.slides.editorPath, { waitUntil: "load" })
    await expect(page.getByRole("heading", { name: fixture.slides.title, level: 1, exact: true })).toBeVisible()
    const source = await http(auth, fixture.slides.source.url, 200)
    expect(sha(source.bytes)).toBe(fixture.slides.source.sha256); expect(source.bytes.length).toBe(fixture.slides.source.bytes)
    await http(publicContext, fixture.slides.source.url, 404, "GET", {}, 4096); completed.add(stage)
    stage = "slides-upload"; actionPath = fixture.slides.editorPath
    const attachment = Buffer.from(`Authored ${kind} ${info.project.name} attachment.\nExact UTF-8: café.\n`), attachmentTitle = `Authored attachment ${kind} ${info.project.name}`
    await page.getByPlaceholder("Asset title", { exact: true }).fill(attachmentTitle)
    const assetForm = page.getByText("Add asset by URL or upload", { exact: true }).locator("..")
    await assetForm.getByRole("combobox").selectOption("document")
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Upload file", exact: true }).click()])
    await chooser.setFiles({ name: "authored-private-attachment.txt", mimeType: "text/plain", buffer: attachment })
    await expect(page.getByText("Asset uploaded and attached to the deck.", { exact: true })).toBeVisible()
    const article = page.locator("article").filter({ has: page.getByText(attachmentTitle, { exact: true }) })
    await expect(article).toBeVisible()
    const attachmentUrl = local((await article.getByRole("link", { name: "Open asset", exact: true }).getAttribute("href"))!)
    expect(attachmentUrl).toMatch(/^\/files\/uploads\//)
    expect((await http(auth, attachmentUrl, 200)).bytes.equals(attachment)).toBe(true)
    await http(publicContext, attachmentUrl, 404, "GET", {}, 4096)
    observations.attachment = { url: attachmentUrl, bytes: attachment.length, sha256: sha(attachment) }; completed.add(stage)
    stage = "slides-foreign-registration"
    await page.getByPlaceholder("Asset title", { exact: true }).fill("Authored external reference")
    await page.getByPlaceholder("https://...", { exact: true }).fill("https://example.test/explicit-reference.pdf")
    const [assetRequest] = await Promise.all([page.waitForRequest((request) => request.url() === ORIGIN + fixture.slides.editorPath && request.method() === "POST" && Boolean(request.headers()["next-action"])), page.getByRole("button", { name: "Add asset", exact: true }).click()])
    await expect(page.getByPlaceholder("Asset title", { exact: true })).toHaveValue("")
    await expect(page.getByText("Authored external reference", { exact: true })).toBeVisible()
    const actionId = assetRequest.headers()["next-action"], originalArguments = assetRequest.postDataJSON()
    expect(actionId).toMatch(/^[A-Za-z0-9_-]{1,256}$/); expect(Array.isArray(originalArguments)).toBe(true); expect(originalArguments).toHaveLength(1)
    expect(originalArguments[0].deckId).toBe(fixture.slides.id); expect(originalArguments[0].url).toBe("https://example.test/explicit-reference.pdf")
    const foreignTitle = "Refused foreign attachment", actionHeaders: Record<string, string> = { Origin: ORIGIN, "Content-Type": "text/plain;charset=UTF-8", "Next-Action": actionId, Accept: "text/x-component" }
    if (assetRequest.headers()["next-router-state-tree"]) actionHeaders["Next-Router-State-Tree"] = assetRequest.headers()["next-router-state-tree"]
    const rejected = await auth.request.post(ORIGIN + fixture.slides.editorPath, { headers: actionHeaders, data: JSON.stringify([{ ...originalArguments[0], title: foreignTitle, url: fixture.victim.url, storageKey: fixture.victim.key }]), timeout: 10000, maxRedirects: 0 })
    try { expect(rejected.status()).toBe(500); const bytes = await body(rejected, 1024 * 1024); negatives.push({ stage, kind: "real-asset-action", status: rejected.status(), bytes: bytes.length, sha256: sha(bytes) }) }
    finally { await rejected.dispose() }
    await http(auth, fixture.victim.url, 404, "GET", {}, 4096); await http(publicContext, fixture.victim.url, 404, "GET", {}, 4096)
    await drain(); await page.reload({ waitUntil: "load" }); await expect(page.getByText(foreignTitle, { exact: true })).toHaveCount(0)
    observations.foreignRegistrationAndReadRefused = true; completed.add(stage)
    async function publishSlides(protectedVersion: boolean, index: number) {
      stage = `slides-publish-${index}`; actionPath = fixture.slides.editorPath; target = fixture.slides.editorPath
      expect(slidesPublishDiagnostics.length).toBeLessThan(3)
      const diagnostic: SlidesPublishRead = { index, stage, phase: "prepare", waitLimitMs: 10000, events: [], request: null, response: null,
        finishedAt: null, failedAt: null, failure: null, finishedResolvedAt: null, listenersRemoved: false, timerCleared: false }
      slidesPublishDiagnostics.push(diagnostic)
      const phase = (value: string) => { diagnostic.phase = value; diagnostic.events.push({ phase: value, at: Date.now() }) }
      const deadline = Date.now() + 10000, remaining = () => Math.max(1, deadline - Date.now())
      phase("prepare")
      await page.getByPlaceholder("Optional password", { exact: true }).fill(protectedVersion ? password : "", { timeout: remaining() })
      const expectedLabel = await page.getByText("Publishing", { exact: true }).locator("..").getByRole("textbox", { name: "Version label", exact: true }).inputValue({ timeout: remaining() })
      function matches(request: BrowserRequest) {
        if (request.url() !== ORIGIN + fixture.slides.editorPath || request.method() !== "POST" || !request.headers()["next-action"]) return false
        try {
          const args = request.postDataJSON()
          return Array.isArray(args) && args.length === 1 && args[0]?.deckId === fixture.slides.id && args[0]?.label === expectedLabel
            && args[0]?.source && typeof args[0].source === "object" && args[0].source.title === fixture.slides.title && Array.isArray(args[0].source.slides)
        } catch { return false }
      }
      let selected: BrowserRequest | null = null, rejectFailure: (error: Error) => void = () => {}
      const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject })
      const onRequest = (request: BrowserRequest) => {
        if (!matches(request)) return
        if (selected && selected !== request) { rejectFailure(new Error("Multiple publish requests matched the reviewed action.")); return }
        if (selected) return
        selected = request
        const payload = request.postDataJSON()[0]
        diagnostic.request = { method: request.method(), path: new URL(request.url()).pathname, startedAt: Date.now(),
          actionSha256: sha(request.headers()["next-action"]), payloadBytes: request.postDataBuffer()?.length ?? 0, deckId: payload.deckId,
          labelSha256: sha(payload.label), sourceSha256: sha(canonicalSerialize(payload.source)) }
      }
      const onFailed = (request: BrowserRequest) => {
        if (request !== selected) return
        diagnostic.failedAt = Date.now(); diagnostic.failure = clean(request.failure()?.errorText ?? "unknown", secrets)
        rejectFailure(new Error("The exact Slides publish request failed: " + diagnostic.failure))
      }
      const onFinished = (request: BrowserRequest) => { if (request === selected) diagnostic.finishedAt = Date.now() }
      auth.on("request", onRequest); auth.on("requestfailed", onFailed); auth.on("requestfinished", onFinished)
      let timer: ReturnType<typeof setTimeout> | undefined
      const expired = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Slides publication deadline exceeded at " + diagnostic.phase)), remaining())
      })
      try {
        phase("request-and-response")
        const [request, response] = await Promise.race([Promise.all([
          page.waitForRequest(matches, { timeout: remaining() }),
          page.waitForResponse((response) => matches(response.request()), { timeout: remaining() }),
          page.getByRole("button", { name: "Publish version", exact: true }).click({ timeout: remaining() }),
        ]), failure, expired])
        expect(request === selected).toBe(true); expect(response.request() === request).toBe(true)
        diagnostic.response = { at: Date.now(), status: response.status(), contentType: response.headers()["content-type"] ?? "" }
        expect(response.status()).toBe(200)
        phase("response-finished")
        if (request.failure()) onFailed(request)
        expect(await Promise.race([response.finished(), failure, expired])).toBeNull()
        diagnostic.finishedResolvedAt = Date.now()
        expect(diagnostic.finishedAt).not.toBeNull(); expect(diagnostic.failedAt).toBeNull(); expect(request.failure()).toBeNull()
        phase("button-ready")
        await Promise.race([expect(page.getByRole("button", { name: "Publish version", exact: true })).toBeEnabled({ timeout: remaining() }), failure, expired])
      } finally {
        clearTimeout(timer); diagnostic.timerCleared = true
        auth.off("request", onRequest); auth.off("requestfailed", onFailed); auth.off("requestfinished", onFinished)
        diagnostic.listenersRemoved = true
      }
      phase("snapshot")
      const value = await snapshot("slides"), current = value.versions.find((row: { id: string }) => row.id === value.deck.publishedVersionId)
      expect(current).toBeTruthy(); expect(current.status).toBe("published"); expect(current.passwordProtected).toBe(protectedVersion)
      expect(value.deck.passwordProtected).toBe(protectedVersion)
      legacyVersions.add(current.id); const artifactPath = `/published/${fixture.slides.publicId}/${current.id}`
      publicPages.add(artifactPath); publicPages.add(fixture.slides.publicPath); publicPages.add(attachmentUrl)
      const asset = value.assets.find((row: { url: string }) => row.url === attachmentUrl)
      expect(asset).toBeTruthy(); expect(asset.bytes).toBe(attachment.length); expect(asset.sha256).toBe(sha(attachment)); expect(asset.publicInVersions).toContain(current.id)
      const original = value.assets.find((row: { url: string }) => row.url === fixture.slides.source.url)
      expect(original).toBeTruthy(); expect(original.publicInVersions).toEqual([])
      expect(value.assets.some((row: { url: string }) => row.url === fixture.victim.url)).toBe(false)
      phase("complete")
      completed.add(stage); return { current, artifactPath }
    }
    const firstSlides = await publishSlides(false, 1)
    stage = "slides-historical-collision"
    let collisionArmed = false
    try {
      const arm = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/supabase-application-fixture.ts", "collision-on", "--case", caseKey], { cwd: process.cwd(), env: helperEnvironment, encoding: "utf8", timeout: 20000, maxBuffer: 16384 })
      expect(arm.stderr).toBe("")
      const armed = JSON.parse(arm.stdout)
      collisionArmed = true
      expect(armed.armed).toBe(true); expect(armed.caseKey).toBe(caseKey); expect(armed.victimUrl).toBe(fixture.victim.url); expect(armed.victimKey).toBe(fixture.victim.key)
      await http(auth, fixture.victim.url, 404, "GET", {}, 4096)
      await http(publicContext, fixture.victim.url, 404, "GET", {}, 4096)
      observations.historicalCollisionPrivateAndPublicRefused = true
    } finally {
      // The helper owns an exact journal; attempt restoration even if the arm
      // acknowledgement was lost, and never modify metadata in browser code.
      const off = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/supabase-application-fixture.ts", "collision-off", "--case", caseKey], { cwd: process.cwd(), env: helperEnvironment, encoding: "utf8", timeout: 20000, maxBuffer: 16384 })
      expect(off.stderr).toBe("")
      const restored = JSON.parse(off.stdout)
      expect(restored.restored).toBe(true); expect(restored.caseKey).toBe(caseKey)
      observations.historicalCollisionRestored = true
    }
    expect(collisionArmed).toBe(true); completed.add(stage)
    stage = "slides-public-attachment"
    const raw = await http(publicContext, firstSlides.artifactPath, 200)
    expect(sha(raw.bytes)).toBe(firstSlides.current.artifact.sha256)
    await publicPage.goto(fixture.slides.publicPath, { waitUntil: "load" })
    await expect(publicPage.locator("iframe")).toHaveAttribute("src", firstSlides.artifactPath)
    await expect(publicPage.frameLocator("iframe").getByRole("heading", { name: fixture.slides.title, exact: true }).first()).toBeVisible()
    await expect(publicPage.getByRole("region", { name: "Published attachments", exact: true }).getByRole("link", { name: attachmentTitle, exact: false })).toHaveAttribute("href", attachmentUrl)
    expect((await http(publicContext, attachmentUrl, 200)).bytes.equals(attachment)).toBe(true)
    await http(publicContext, fixture.slides.source.url, 404, "GET", {}, 4096)
    await layout(page, "slides-editor"); completed.add(stage)
    // Leave the open legacy runtime normally before tightening its password policy.
    stage = "slides-leave-public"; await publicPage.goto("about:blank"); completed.add(stage)
    const protectedSlides = await publishSlides(true, 2)
    expect(protectedSlides.current.id).not.toBe(firstSlides.current.id)
    stage = "slides-password-gate"
    for (const pathname of [firstSlides.artifactPath, protectedSlides.artifactPath]) {
      const refusal = await http(publicContext, pathname, 401, "GET", {}, 4096)
      expect(refusal.headers["cache-control"]).toBe("private, no-store")
    }
    await http(publicContext, attachmentUrl, 404, "GET", {}, 4096)
    const protectedContext = await context(), gatePage = await protectedContext.newPage()
    await gatePage.goto(fixture.slides.publicPath, { waitUntil: "load" })
    await expect(gatePage.getByText("Protected deck", { exact: true })).toBeVisible(); await expect(gatePage.locator("iframe")).toHaveCount(0)
    actionPath = fixture.slides.publicPath; target = fixture.slides.publicPath
    await gatePage.getByPlaceholder("Enter deck password", { exact: true }).fill("authored-wrong-password")
    await gatePage.getByRole("button", { name: "Unlock deck", exact: true }).click()
    await expect(gatePage.getByText("Incorrect password.", { exact: true })).toBeVisible(); await expect(gatePage.locator("iframe")).toHaveCount(0)
    await gatePage.getByPlaceholder("Enter deck password", { exact: true }).fill(password)
    await gatePage.getByRole("button", { name: "Unlock deck", exact: true }).click()
    await expect(gatePage.locator("iframe")).toHaveAttribute("src", protectedSlides.artifactPath)
    await expect(gatePage.frameLocator("iframe").getByRole("heading", { name: fixture.slides.title, exact: true }).first()).toBeVisible()
    const accessCookie = (await protectedContext.cookies(ORIGIN)).find((cookie) => cookie.name === `slides_public_${fixture.slides.publicId}`)
    expect(accessCookie?.httpOnly).toBe(true); expect(accessCookie?.value).not.toBe("1")
    expect(sha((await http(protectedContext, protectedSlides.artifactPath, 200)).bytes)).toBe(protectedSlides.current.artifact.sha256)
    const freshContext = await context(), freshPage = await freshContext.newPage()
    await freshPage.goto(fixture.slides.publicPath, { waitUntil: "load" })
    await expect(freshPage.getByText("Protected deck", { exact: true })).toBeVisible(); await expect(freshPage.locator("iframe")).toHaveCount(0)
    await http(freshContext, protectedSlides.artifactPath, 401, "GET", { Cookie: `slides_public_${fixture.slides.publicId}=1` }, 4096)
    await layout(gatePage, "slides-password-admitted"); observations.passwordGateFreshContexts = true; completed.add(stage)
    stage = "slides-password-leave"; await gatePage.goto("about:blank"); await freshPage.goto("about:blank"); completed.add(stage)
    const lastSlides = await publishSlides(false, 3)
    stage = "slides-old-password-policy"
    expect(lastSlides.current.id).not.toBe(protectedSlides.current.id)
    expect(sha((await http(freshContext, lastSlides.artifactPath, 200)).bytes)).toBe(lastSlides.current.artifact.sha256)
    await http(freshContext, protectedSlides.artifactPath, 401, "GET", {}, 4096)
    await http(protectedContext, protectedSlides.artifactPath, 401, "GET", {}, 4096)
    await http(freshContext, fixture.slides.source.url, 404, "GET", {}, 4096)
    expect((await http(freshContext, attachmentUrl, 200)).bytes.equals(attachment)).toBe(true)
    observations.oldProtectedVersionStaysPrivate = true; completed.add(stage)
    stage = "sign-out"; actionPath = fixture.slides.editorPath; target = "/"
    await drain(); await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(ORIGIN + "/"); await page.waitForLoadState("load")
    expect((await auth.cookies(ORIGIN)).some((cookie) => cookie.name === "slides_session")).toBe(false)
    completed.add(stage)
    await signIn(true)
    stage = "fresh-private-reopen"; target = savedPath
    await page.goto(savedPath, { waitUntil: "load" }); await ready()
    await expect(page.getByRole("heading", { name: titles[2], level: 1, exact: true })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 3\.$/ })).toBeVisible()
    await expect(publisher.getByRole("link", { name: "Open current public version", exact: true })).toHaveAttribute("href", second.publicUrl)
    expect(uploads).toBe(1); expect(responseProofs).toHaveLength(5)
    observations.freshSignInPreservesPrivateAndPublicState = true; completed.add(stage); stage = "complete"
  } catch (error) { primary = error }
  finally {
    actionPath = null
    try { await drain() } catch (error) { cleanupFailures.push(clean(error, secrets)) }
    for (const selected of [...contexts].reverse()) {
      try { await selected.close(); contextsClosed++ } catch (error) { cleanupFailures.push(clean(error, secrets)) }
    }
    await Promise.allSettled([...pending]); await new Promise<void>((resolve) => setImmediate(resolve))
    for (const row of nodeReads) if (!row.finished || row.failed) cleanupFailures.push("An actual API request did not finish successfully")
    for (const row of cancellations) if (primary || stage !== "complete" || !completed.has(row.stage)) problem("requestFailures", "Unproven navigation cancellation")
    const report = { kind: "iv-supabase-application-boundary", schemaVersion: 1, title: info.title, profile: info.project.name, documentKind: kind,
      stage, status: !primary && Object.values(counts).every((value) => value === 0) && cleanupFailures.length === 0 && contextsClosed === 4 ? "passed" : "failed",
      primaryError: primary ? clean(primary instanceof Error ? primary.message : primary, secrets, 2048) : null,
      fixture: { workspaceSlug: fixture.workspaceSlug, slidesId: fixture.slides.id, slidesPublicId: fixture.slides.publicId },
      observations, responseObserver: { kind: "native-fetch-response-clone", maxGetBytes: 131072, maxPostBytes: 5 * 1024 * 1024, maxPerDocument: 32, documents: cloneSnapshots,
        correlation: "method-path-request-id-and-time-only", exactGetRequestBindingClaimed: false, originalFetchArgumentsAndPromiseRetained: true, rawResponseBodiesRetained: false },
      actualApiRequests: nodeReads, boundary: { counts, diagnostics, allowedReads, allowedActions, uploads, slidesEvents, developmentWebSockets, navigationCancellations: cancellations },
      cleanup: { contextsCreated: contexts.length, contextsClosed, pendingJobs: pending.size, failures: cleanupFailures } }
    const bytes = Buffer.from(JSON.stringify(report)); expect(bytes.length).toBeLessThanOrEqual(65536)
    await info.attach("iv-supabase-application-boundary", { body: bytes, contentType: "application/json" })
    expect.soft(Object.values(counts)).toEqual(Array(8).fill(0)); expect.soft(cleanupFailures).toEqual([]); expect.soft(contextsClosed).toBe(4)
    if (primary) throw new Error(clean(primary instanceof Error ? primary.message : primary, secrets, 2048))
  }
}

// Four identities use real factories, portable sign-in, local CLI PostgreSQL and
// private Storage over owned TLS. This is not hosted deployment or native Auth proof.
test("a Course persists publishes revokes and republishes through Supabase with private Slides attachments and password gates", async ({ browser, page }, info) => {
  await journey("course", browser, page, info)
})
test("a Report persists publishes revokes and republishes through Supabase with private Slides attachments and password gates", async ({ browser, page }, info) => {
  await journey("report", browser, page, info)
})
