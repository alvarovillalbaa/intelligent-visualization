import { createHash, randomUUID } from "node:crypto"
import { expect, test, type Page, type Request as PlaywrightRequest, type TestInfo } from "@playwright/test"
import { createStarterCourseDocument, createStarterReportDocument } from "../../packages/domain/fixtures"

const ORIGIN = "http://127.0.0.1:3100"
const WORKSPACE = "/app/workspaces/core-growth"
const API = "/api/workspaces/core-growth/visualizations"
type Kind = "course" | "report"
type ResponseClone = { requestId: string; status: number; cacheControl: string; contentType: string; bytes: number; body: string }
type ResponseObserver = { requests: number; jobs: Set<Promise<void>>; records: Record<string, ResponseClone>; failures: string[] }

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

async function journey(kind: Kind, page: Page, testInfo: TestInfo) {
  const context = page.context(), label = kind === "course" ? "Course" : "Report"
  const nonce = randomUUID().slice(0, 8)
  const initialTitle = `Authored ${label} ${testInfo.project.name} ${nonce}`
  const firstTitle = `${initialTitle} applied`, finalTitle = `${initialTitle} revision two`
  const document = kind === "course" ? createStarterCourseDocument() : createStarterReportDocument()
  document.title = initialTitle
  document.seo.title = initialTitle
  const fixture = { kind, document, provider: "Authored browser fixture", modelName: "authored-no-model", generatedAt: Date.now() }
  const pages = new Set(["/", "/auth", "/app", WORKSPACE, "/d/northstar-labs/slides-operating-system"])
  let stage = "setup", target: string | null = null, postPath: string | null = null, savedPath: string | null = null
  let primary: unknown, closed = false, generationResponses = 0, saveRequests = 0
  let allowedReads = 0, allowedActions = 0, developmentWebSockets = 0
  const counts = { unexpectedRequests: 0, unexpectedWebSockets: 0, requestFailures: 0, httpErrors: 0, pageErrors: 0, consoleErrors: 0, dialogs: 0 }
  const diagnostics: Array<{ kind: string; stage: string; detail: string }> = []
  const observations: Record<string, unknown> = { kind, authoredGeneration: true, layout: [], saves: [] }
  const observerKey = `iv_workspace_response_${randomUUID().replaceAll("-", "")}`
  const observerReads: Array<{ requestId: string; status: number; cacheControl: string; bytes: number; sha256: string }> = []
  const observerFailures: string[] = []
  let observerPending = 0
  const completed = new Set<string>(), pending = new Set<Promise<void>>(), cleanupFailures: string[] = []
  const admitted = new WeakMap<PlaywrightRequest, { kind: "read" | "action"; transition: string; target: string | null }>()
  const received = new WeakMap<PlaywrightRequest, { status: number; contentType: string; path: string | null; redirect: string | null }>()
  const cancellations: Array<{ transition: string; method: string; path: string; target: string; status: number; contentType: string; redirect: string | null }> = []
  function problem(key: keyof typeof counts, detail: unknown) {
    counts[key]++
    if (diagnostics.length < 32) diagnostics.push({ kind: key, stage, detail: bounded(detail) })
  }
  function localPath(raw: string | undefined) {
    if (!raw) return null
    try { const url = new URL(raw.split(";")[0], ORIGIN); return url.origin === ORIGIN && !url.username && !url.password && !url.hash && pages.has(url.pathname) && query(url, true) ? url.pathname : null }
    catch { return null }
  }
  function requestLabel(request: PlaywrightRequest) {
    const url = new URL(request.url())
    return `${request.method()} ${url.origin === ORIGIN ? url.pathname : "cross-origin"} queryKeys=${[...url.searchParams.keys()].sort().join(",")}`
  }
  page.on("pageerror", (error) => problem("pageErrors", error.message))
  page.on("console", (message) => { if (message.type() === "error") problem("consoleErrors", message.text()) })
  page.on("dialog", (dialog) => {
    problem("dialogs", dialog.type())
    const job = dialog.dismiss().catch((error) => { cleanupFailures.push(bounded(error)) }).finally(() => pending.delete(job))
    pending.add(job)
  })
  context.on("page", (opened) => { if (opened !== page) problem("unexpectedRequests", "Unexpected extra page") })
  context.on("response", (response) => {
    const headers = response.headers()
    received.set(response.request(), { status: response.status(), contentType: (headers["content-type"] ?? "").slice(0, 100), path: localPath(response.url()), redirect: localPath(headers["x-action-redirect"] ?? headers.location) })
    if (response.status() >= 400) problem("httpErrors", `${response.status()} ${requestLabel(response.request())}`)
  })
  context.on("requestfailed", (request) => {
    const permission = admitted.get(request), response = received.get(request), url = new URL(request.url())
    const flight = permission?.kind === "read" && request.method() === "GET" && url.searchParams.has("_rsc") && request.headers().rsc === "1"
    const action = permission?.kind === "action" && request.method() === "POST"
    const stream = response?.status === 200 && response.contentType.startsWith("text/x-component")
    const match = permission?.target && (action ? response?.redirect === permission.target : response?.path === permission.target && url.pathname === permission.target)
    if (request.failure()?.errorText === "net::ERR_ABORTED" && permission && response && match && (flight || action)
      && (flight ? stream : stream || [303, 307, 308].includes(response.status)) && cancellations.length < 16) {
      cancellations.push({ transition: permission.transition, method: request.method(), path: url.pathname, target: permission.target!, status: response.status, contentType: response.contentType, redirect: response.redirect })
    } else problem("requestFailures", `${requestLabel(request)} ${request.failure()?.errorText ?? "unknown"} response=${response?.status ?? "none"} type=${response?.contentType ?? "none"}`)
  })
  async function layout(label: string) {
    const size = await page.evaluate(() => ({ viewport: innerWidth, content: globalThis.document.documentElement.scrollWidth }))
    ;(observations.layout as unknown[]).push({ label, ...size })
    expect(size.content, `${label} horizontal layout`).toBeLessThanOrEqual(size.viewport + 1)
  }
  async function signIn(name: string) {
    stage = name; target = WORKSPACE; postPath = "/auth"
    await page.locator("#sign-in-email").fill("morgan@northstarlabs.com")
    await page.locator("#sign-in-password").fill("demo1234")
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL(`${ORIGIN}${WORKSPACE}`)
    await expect(page.getByRole("heading", { name: "Core Growth", exact: true, level: 1 })).toBeVisible()
    await page.waitForLoadState("load")
    const cookie = (await context.cookies(ORIGIN)).find((row) => row.name === "slides_session")
    expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Lax")
    completed.add(stage); postPath = null
  }
  async function edit(title: string) {
    await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: `Edit ${kind}`, exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(kind === "course" ? "Title" : "Report title", { exact: true }).fill(title)
    await dialog.getByRole("button", { name: "Apply changes", exact: true }).click()
    await expect(dialog).toBeHidden()
    if (stage === "apply-first") {
      const back = page.getByRole("button", { name: "Back", exact: true })
      await back.click()
      await expect(back).toBeHidden()
      await expect(page.getByRole("button", { name: `Save ${label}`, exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: `Save ${label}`, exact: true })).toBeEnabled()
    }
  }
  async function inspectSaved(title: string) {
    await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: `Edit ${kind}`, exact: true })
    await expect(dialog.getByLabel(kind === "course" ? "Title" : "Report title", { exact: true })).toHaveValue(title)
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  async function save(buttonName: string, revision: number, title: string) {
    stage = revision === 1 ? "save-first" : "save-revision"; target = savedPath
    const deadline = Date.now() + 10_000
    const remaining = () => Math.max(1, deadline - Date.now())
    try {
    const [response] = await Promise.all([
      page.waitForResponse((response) => response.url() === ORIGIN + API && response.request().method() === "POST", { timeout: remaining() }),
      page.getByRole("button", { name: buttonName, exact: true }).click({ timeout: remaining() }),
    ])
    expect(response.status()).toBe(200)
    expect(response.headers()["cache-control"]).toContain("no-store")
    const requestId = response.request().postDataJSON().requestId
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
    await expect.poll(() => page.evaluate(({ key, requestId }) => {
      const state = (window as unknown as Record<string, ResponseObserver>)[key]
      return !state || state.failures.length ? "failed" : state.records[requestId] && state.jobs.size === 0 ? "ready" : "pending"
    }, { key: observerKey, requestId }), { timeout: remaining() }).toBe("ready")
    const observed = await page.evaluate(({ key, requestId }) => (window as unknown as Record<string, ResponseObserver>)[key].records[requestId], { key: observerKey, requestId })
    expect(observed.requestId).toBe(requestId); expect(observed.status).toBe(200)
    expect(observed.cacheControl).toContain("no-store"); expect(observed.contentType).toMatch(/^application\/json(?:;|$)/)
    expect(observed.bytes).toBe(Buffer.byteLength(observed.body, "utf8")); expect(observed.bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
    const ack = JSON.parse(observed.body)
    expect(ack.receipt.requestId).toBe(requestId)
    observerReads.push({ requestId, status: observed.status, cacheControl: observed.cacheControl, bytes: observed.bytes, sha256: createHash("sha256").update(observed.body).digest("hex") })
    expect(ack.status).toBe("saved"); expect(ack.receipt.status).toBe("saved")
    expect(ack.draft.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ack.draft.kind).toBe(kind); expect(ack.draft.title).toBe(title)
    expect(ack.draft.workspaceSlug).toBe("core-growth")
    expect(ack.draft.document.title).toBe(title); expect(ack.draft.document.kind).toBe(kind)
    expect(ack.draft.draftRevision).toBe(revision); expect(ack.receipt.acceptedRevision).toBe(revision)
    expect(ack.draft.draftHash).toMatch(/^[0-9a-f]{64}$/)
    expect(ack.receipt.documentHash).toBe(ack.draft.draftHash)
    ;(observations.saves as unknown[]).push({ id: ack.draft.id, revision, documentHash: ack.draft.draftHash, requestId: ack.receipt.requestId })
    if (savedPath) expect(savedPath).toBe(`${WORKSPACE}/visualizations/${ack.draft.id}`)
    savedPath = `${WORKSPACE}/visualizations/${ack.draft.id}`; pages.add(savedPath)
    completed.add(stage)
    } catch (error) {
      const failure: Record<string, unknown> = {
        stage, revision, originalError: bounded(error instanceof Error ? error.message : error, 2048),
      }
      observations.saveFailure = failure
      try {
        const visible = await page.locator("body").evaluate((body) => {
          const shown = (element: Element) => {
            const style = getComputedStyle(element)
            return element.getClientRects().length > 0 && style.visibility !== "hidden" && style.display !== "none"
          }
          return {
            alerts: Array.from(body.querySelectorAll('[role="alert"]')).filter(shown).slice(0, 8).map((element) => (element.textContent ?? "").slice(0, 4096)).join("\n"),
            buttons: Array.from(body.querySelectorAll("button")).filter(shown).filter((button) => /save/i.test(button.textContent ?? "")).slice(0, 4).map((button) => ({ text: (button.textContent ?? "").trim().slice(0, 120), disabled: button.disabled, ariaDisabled: button.getAttribute("aria-disabled") })),
            statuses: Array.from(body.querySelectorAll('[role="status"]')).filter(shown).slice(0, 4).map((element) => (element.textContent ?? "").trim().slice(0, 240)),
          }
        }, undefined, { timeout: 1000 })
        let alerts = ""
        for (const character of bounded(visible.alerts, 2048)) {
          if (Buffer.byteLength(alerts + character, "utf8") > 2048) break
          alerts += character
        }
        failure.alerts = alerts
        failure.visibleSaveButtons = visible.buttons.map((button) => ({ ...button, text: bounded(button.text, 120) }))
        failure.statuses = visible.statuses.map((status) => bounded(status, 240))
      } catch (diagnosticError) {
        failure.diagnosticError = bounded(diagnosticError, 240)
      }
      throw error
    }
  }
  try {
    // Explicit observation adapter: only real save responses are cloned. The
    // original fetch arguments, Promise and Response reach the app unchanged.
    await context.addInitScript(({ key, origin, api }) => {
      const state: ResponseObserver = { requests: 0, jobs: new Set(), records: Object.create(null), failures: [] }
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
        let selected = false, requestCopy: Request | null = null
        try {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href)
          selected = url.origin === origin && url.pathname === api && !url.search && !url.hash && !url.username && !url.password
            && String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST"
          if (selected) {
            state.requests++
            if (typeof init?.body === "string") requestCopy = new Request(url, { method: "POST", body: init.body }).clone()
            else if (input instanceof Request && init?.body === undefined) requestCopy = input.clone()
            else state.failures.push("observer-unsupported-request-body")
          }
        } catch { state.failures.push("observer-request-clone-failed") }
        const result = Reflect.apply(original, this, args) as Promise<Response>
        if (selected) {
          const job = result.then(async (response) => {
            const copy = response.clone()
            if (!requestCopy) throw new Error("observer-request-copy-missing")
            const [requestBody, responseBody] = await Promise.all([text(requestCopy, 2 * 1024 * 1024), text(copy, 5 * 1024 * 1024)])
            const requestId: unknown = JSON.parse(requestBody.value).requestId
            if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/.test(requestId) || state.records[requestId]) throw new Error("observer-request-identity-invalid")
            if (state.requests > 4) throw new Error("observer-request-count-exceeded")
            state.records[requestId] = { requestId, status: response.status, cacheControl: response.headers.get("cache-control") ?? "", contentType: response.headers.get("content-type") ?? "", bytes: responseBody.bytes, body: responseBody.value }
          }).catch(() => { if (state.failures.length < 8) state.failures.push("observer-real-save-body-failed") }).finally(() => state.jobs.delete(job))
          state.jobs.add(job)
        }
        return result
      }
    }, { key: observerKey, origin: ORIGIN, api: API })
    await context.routeWebSocket("**/*", (route) => {
      const url = new URL(route.url())
      if (url.protocol === "ws:" && url.host === "127.0.0.1:3100" && url.pathname === "/_next/webpack-hmr" && !url.username && !url.password && !url.hash && url.search.length <= 256) { developmentWebSockets++; route.connectToServer() }
      else { problem("unexpectedWebSockets", "Non-development WebSocket"); route.close() }
    })
    await context.route("**/*", async (route) => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== ORIGIN || url.username || url.password || url.hash) { problem("unexpectedRequests", requestLabel(request)); await route.abort("blockedbyclient"); return }
      if (request.method() === "POST" && url.pathname === "/api/visualizations/generate" && !url.search && stage === "generate" && generationResponses === 0) {
        const body = request.postDataJSON()
        expect(body.kind).toBe(kind); expect(body.generationInput.rawText).toContain("Authored private workspace")
        generationResponses++
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }); return
      }
      const read = ["GET", "HEAD"].includes(request.method())
      const staticRead = url.pathname.startsWith("/_next/static/") && !url.pathname.split("/").includes("..") && query(url)
      if (read && ((pages.has(url.pathname) && query(url, true)) || staticRead || (url.pathname === "/__nextjs_font/geist-latin.woff2" && !url.search) || (url.pathname === "/favicon.ico" && !url.search))) {
        const refreshTarget = stage === "save-first" && request.method() === "GET" && url.pathname === WORKSPACE
          && url.searchParams.has("_rsc") && request.headers().rsc === "1" ? WORKSPACE : target
        admitted.set(request, { kind: "read", transition: stage, target: refreshTarget }); allowedReads++; await route.continue(); return
      }
      if (request.method() === "POST" && url.pathname === API && !url.search && ["save-first", "save-revision"].includes(stage)
        && request.headers().origin === ORIGIN && /^application\/json(?:;|$)/.test(request.headers()["content-type"] ?? "") && (request.postDataBuffer()?.length ?? 0) <= 2 * 1024 * 1024) {
        saveRequests++; await route.continue(); return
      }
      if (request.method() === "POST" && url.pathname === postPath && pages.has(url.pathname) && !url.search && request.headers().origin === ORIGIN
        && /^(multipart\/form-data;|application\/x-www-form-urlencoded(?:;|$)|text\/plain(?:;|$))/.test(request.headers()["content-type"] ?? "") && (request.postDataBuffer()?.length ?? 0) <= 32_768) {
        admitted.set(request, { kind: "action", transition: stage, target: stage.startsWith("sign-in") ? "/app" : target }); allowedActions++; await route.continue(); return
      }
      problem("unexpectedRequests", requestLabel(request)); await route.abort("blockedbyclient")
    })
    stage = "auth-entry"; target = "/auth"
    await page.goto("/auth", { waitUntil: "load" }); await signIn("sign-in")
    stage = "generate"; target = WORKSPACE
    await page.getByLabel("Text or link", { exact: true }).fill(`Authored private workspace ${kind} content. This is a fixture, not a model request.`)
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    const formats = page.getByRole("group", { name: "Draft formats", exact: true })
    await formats.getByRole("button", { name: /^Slides\b/ }).click()
    await formats.getByRole("button", { name: new RegExp(`^${label}\\b`) }).click()
    await expect(formats.getByRole("button", { name: new RegExp(`^${label}\\b`) })).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "Create draft", exact: true }).click()
    const result = page.getByRole("listitem", { name: `${label} result`, exact: true })
    await expect(result.getByText(initialTitle, { exact: true })).toBeVisible()
    expect(generationResponses).toBe(1); completed.add(stage)
    stage = "apply-first"; await edit(firstTitle)
    await expect(result.getByText(firstTitle, { exact: true })).toBeVisible(); completed.add(stage)
    await save(`Save ${label}`, 1, firstTitle)
    await expect(result.getByText("Saved privately to this workspace · revision 1.", { exact: true })).toBeVisible()
    stage = "open-saved"; target = savedPath
    await result.getByRole("link", { name: `Open saved ${label}`, exact: true }).click()
    await expect(page).toHaveURL(ORIGIN + savedPath)
    await expect(page.getByRole("heading", { name: firstTitle, exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 1\.$/ })).toBeVisible()
    await page.waitForLoadState("load")
    completed.add(stage)
    stage = "apply-revision"; await edit(finalTitle); completed.add(stage)
    await save("Save revision", 2, finalTitle)
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 2\.$/ })).toBeVisible()
    stage = "saved-reload"; target = savedPath
    await page.reload({ waitUntil: "load" })
    await expect(page.getByRole("heading", { name: finalTitle, exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 2\.$/ })).toBeVisible()
    await inspectSaved(finalTitle)
    observations.reloadedTitle = finalTitle; completed.add(stage)
    await layout("saved-editor")
    stage = "workspace-return"; target = WORKSPACE
    await page.goto(WORKSPACE, { waitUntil: "load" })
    await expect(page.getByRole("article", { name: `Saved ${label}: ${finalTitle}`, exact: true }).getByRole("link", { name: `Open saved ${label}`, exact: true })).toBeVisible()
    completed.add(stage)
    stage = "sign-out"; target = "/"; postPath = WORKSPACE
    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(ORIGIN + "/")
    await page.waitForLoadState("load")
    expect((await context.cookies(ORIGIN)).some((cookie) => cookie.name === "slides_session")).toBe(false)
    completed.add(stage); postPath = null
    stage = "auth-again"; target = "/auth"
    await page.goto("/auth", { waitUntil: "load" }); await signIn("sign-in-again")
    stage = "new-session-reopen"; target = savedPath
    await page.goto(savedPath!, { waitUntil: "load" })
    await expect(page.getByRole("heading", { name: finalTitle, exact: true, level: 1 })).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: /^Saved revision 2\.$/ })).toBeVisible()
    await inspectSaved(finalTitle)
    await layout("new-session")
    expect(saveRequests).toBe(2)
    observations.newSessionRestored = true; observations.finalTitle = finalTitle
    completed.add(stage); stage = "complete"
  } catch (error) { primary = error }
  finally {
    postPath = null
    try {
      const finalObserver = await page.locator("body").evaluate(async (_body, key) => {
        const state = (window as unknown as Record<string, ResponseObserver>)[key]
        if (!state) return { pending: 0, failures: ["observer-state-missing"] }
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([Promise.allSettled([...state.jobs]), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000) })]).finally(() => clearTimeout(timer))
        return { pending: state.jobs.size, failures: state.failures.slice(0, 8) }
      }, observerKey, { timeout: 1500 })
      observerPending = finalObserver.pending; observerFailures.push(...finalObserver.failures)
    } catch { observerFailures.push("observer-final-drain-failed") }
    if (observerPending || observerFailures.length) cleanupFailures.push("Real save response observation did not close completely")
    try { await context.close(); closed = true } catch (error) { cleanupFailures.push(bounded(error)) }
    await Promise.allSettled([...pending]); await new Promise<void>((resolve) => setImmediate(resolve))
    for (const row of cancellations) if (primary || stage !== "complete" || !completed.has(row.transition) || observations.newSessionRestored !== true) problem("requestFailures", `Unproven cancellation ${row.method} ${row.path} ${row.transition}`)
    const report = { kind: "iv-workspace-draft-boundary", schemaVersion: 1, title: testInfo.title, profile: testInfo.project.name, documentKind: kind,
      stage, status: !primary && Object.values(counts).every((value) => value === 0) && closed && cleanupFailures.length === 0 ? "passed" : "failed",
      authoredGenerationResponses: generationResponses, realSaveRequests: saveRequests, observations,
      responseObserver: { kind: "native-fetch-response-clone", maxResponseBytes: 5 * 1024 * 1024, reads: observerReads, pendingJobs: observerPending, failures: observerFailures },
      primaryError: primary ? bounded(primary instanceof Error ? primary.message : primary, 4096) : null,
      boundary: { counts, diagnostics, allowedReads, allowedActions, developmentWebSockets, navigationCancellationCount: cancellations.length, navigationCancellations: cancellations },
      cleanup: { contextsCreated: 1, contextsClosed: Number(closed), pendingJobs: pending.size, failures: cleanupFailures } }
    const bytes = Buffer.from(JSON.stringify(report))
    expect(bytes.length).toBeLessThanOrEqual(16_384)
    await testInfo.attach("iv-workspace-draft-boundary", { body: bytes, contentType: "application/json" })
    expect.soft(counts).toEqual({ unexpectedRequests: 0, unexpectedWebSockets: 0, requestFailures: 0, httpErrors: 0, pageErrors: 0, consoleErrors: 0, dialogs: 0 })
    expect.soft(cleanupFailures).toEqual([]); expect.soft(closed).toBe(true)
    if (primary) throw primary
  }
}

test("a Course is applied saved privately edited and restored after a new session", async ({ page }, testInfo) => {
  await journey("course", page, testInfo)
})
test("a Report is applied saved privately edited and restored after a new session", async ({ page }, testInfo) => {
  await journey("report", page, testInfo)
})
