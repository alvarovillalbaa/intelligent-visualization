import { randomUUID } from "node:crypto"

import { expect, test, type Page, type Request } from "@playwright/test"

const ORIGIN = "http://127.0.0.1:3100"
const SEED_WORKSPACE = "/app/workspaces/core-growth"
const TITLE = "seeded sign-in editor and authored workspace survive reload and a new session"

function bounded(value: unknown, limit = 240) {
  return String(value).replace(/https?:\/\/[^\s<>"']+/g, (raw) => {
    try {
      const url = new URL(raw)
      return `${url.origin}${url.pathname}`
    } catch {
      return "[URL]"
    }
  }).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").slice(0, limit)
}

function knownQuery(url: URL, page = false) {
  if (url.search.length > 256) return false
  const seen = new Set<string>()
  for (const [key, value] of url.searchParams) {
    if (seen.has(key)) return false
    seen.add(key)
    if (page && key === "_rsc" && /^[A-Za-z0-9_-]{1,128}$/.test(value)) continue
    if (page && url.pathname === "/auth" && key === "returnTo" && value === "/app") continue
    if (page && url.pathname === "/auth" && key === "mode" && ["signin", "signup"].includes(value)) continue
    if (!page && key === "v" && /^[0-9]{1,20}$/.test(value)) continue
    return false
  }
  return true
}

test(TITLE, async ({ page, context }, testInfo) => {
  const profile = testInfo.project.name
  const workspaceName = `Authored PG ${profile} ${randomUUID().slice(0, 8)}`
  const workspaceSlug = workspaceName.toLowerCase().replaceAll(" ", "-")
  const workspacePath = `/app/workspaces/${workspaceSlug}`
  const allowedPages = new Set(["/", "/auth", "/app", SEED_WORKSPACE, workspacePath, "/d/northstar-labs/slides-operating-system"])
  let stage = "guard-setup"
  let postPath: string | null = null
  let primary: unknown
  let contextClosed = false
  let allowedReads = 0
  let allowedActions = 0
  let developmentWebSockets = 0
  let editorPath: string | null = null
  const admitted = new WeakMap<Request, { kind: "read" | "action"; transition: string; target: string | null }>()
  const received = new WeakMap<Request, { status: number; contentType: string; responsePath: string | null; redirectPath: string | null }>()
  const completedTransitions = new Set<string>()
  const navigationCancellations: Array<{ transition: string; method: string; path: string; target: string; status: number; contentType: string; redirectPath: string | null }> = []
  const counts = { unexpectedRequests: 0, unexpectedWebSockets: 0, requestFailures: 0, httpErrors: 0, pageErrors: 0, consoleErrors: 0, dialogs: 0 }
  const diagnostics: Array<{ kind: string; stage: string; detail: string }> = []
  const observations: Record<string, unknown> = { workspaceSlug, viewportOnly: true, layout: [] }
  const pending = new Set<Promise<void>>()
  const cleanupFailures: string[] = []
  function problem(kind: keyof typeof counts, detail: unknown) {
    counts[kind]++
    if (diagnostics.length < 40) diagnostics.push({ kind, stage, detail: bounded(detail) })
  }
  function requestLabel(request: Request) {
    try {
      const url = new URL(request.url())
      return url.origin === ORIGIN
        ? `${request.method()} ${url.pathname} queryKeys=${[...url.searchParams.keys()].sort().join(",")}`
        : `${request.method()} cross-origin`
    } catch {
      return `${request.method()} invalid-URL`
    }
  }
  function transitionTarget() {
    if (["sign-in", "sign-in-again", "session-reload"].includes(stage)) return SEED_WORKSPACE
    if (stage === "seeded-editor") return editorPath
    if (["create-workspace", "workspace-reload"].includes(stage)) return workspacePath
    if (stage === "sign-out") return "/"
    if (stage === "protected-route") return "/auth"
    return null
  }
  function localPath(raw: string | undefined) {
    if (!raw) return null
    try {
      const url = new URL(raw.split(";")[0], ORIGIN)
      return url.origin === ORIGIN && !url.username && !url.password && !url.hash && knownQuery(url, true) && allowedPages.has(url.pathname) ? url.pathname : null
    } catch { return null }
  }
  function watchPage(observed: Page) {
    observed.on("pageerror", (error) => problem("pageErrors", error.message))
    observed.on("console", (message) => { if (message.type() === "error") problem("consoleErrors", message.text()) })
    observed.on("dialog", (dialog) => {
      problem("dialogs", dialog.type())
      const job = dialog.dismiss().catch((error) => { cleanupFailures.push(bounded(error)) }).finally(() => pending.delete(job))
      pending.add(job)
    })
  }
  watchPage(page)
  context.on("page", (opened) => {
    if (opened !== page) problem("unexpectedRequests", "Unexpected extra page")
    watchPage(opened)
  })
  context.on("requestfailed", (request) => {
    const permission = admitted.get(request), response = received.get(request)
    const url = new URL(request.url()), error = request.failure()?.errorText ?? "unknown failure"
    const flightRead = permission?.kind === "read" && request.method() === "GET" && url.searchParams.has("_rsc") && request.headers().rsc === "1"
    const action = permission?.kind === "action" && request.method() === "POST"
    const streamedResponse = response?.status === 200 && response.contentType.startsWith("text/x-component")
    const redirectResponse = response && [303, 307, 308].includes(response.status)
    const targetMatches = permission?.target && (action ? response?.redirectPath === permission.target : response?.responsePath === permission.target && url.pathname === permission.target)
    if (error === "net::ERR_ABORTED" && permission && response && targetMatches && (flightRead || action)
      && (flightRead ? streamedResponse : streamedResponse || redirectResponse) && navigationCancellations.length < 16) {
      navigationCancellations.push({ transition: permission.transition, method: request.method(), path: url.pathname, target: permission.target!,
        status: response.status, contentType: response.contentType, redirectPath: response.redirectPath })
    } else problem("requestFailures", `${requestLabel(request)} ${error} response=${response?.status ?? "none"} type=${response?.contentType ?? "none"} target=${response?.redirectPath ?? response?.responsePath ?? "none"} admitted=${permission?.transition ?? "none"}`)
  })
  context.on("response", (response) => {
    const headers = response.headers()
    received.set(response.request(), { status: response.status(), contentType: (headers["content-type"] ?? "").slice(0, 100),
      responsePath: localPath(response.url()), redirectPath: localPath(headers["x-action-redirect"] ?? headers.location) })
    if (response.status() >= 400) problem("httpErrors", `${response.status()} ${requestLabel(response.request())}`)
  })

  async function layout(label: string) {
    const size = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }))
    ;(observations.layout as unknown[]).push({ label, ...size })
    expect(size.content, `${label} horizontal layout`).toBeLessThanOrEqual(size.viewport + 1)
  }
  async function signIn() {
    await page.locator("#sign-in-email").fill("morgan@northstarlabs.com")
    await page.locator("#sign-in-password").fill("demo1234")
    postPath = "/auth"
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page).toHaveURL(`${ORIGIN}${SEED_WORKSPACE}`)
    await expect(page.getByRole("heading", { level: 1, name: "Core Growth", exact: true })).toBeVisible()
    await page.waitForLoadState("load")
    completedTransitions.add(stage)
    postPath = null
  }

  try {
    await context.routeWebSocket("**/*", (route) => {
      const url = new URL(route.url())
      if (url.protocol === "ws:" && url.host === "127.0.0.1:3100" && url.pathname === "/_next/webpack-hmr" && !url.username && !url.password && !url.hash && url.search.length <= 256) {
        developmentWebSockets++
        route.connectToServer()
      } else {
        problem("unexpectedWebSockets", "Non-development WebSocket")
        route.close()
      }
    })
    await context.route("**/*", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin !== ORIGIN || url.username || url.password || url.hash) {
        problem("unexpectedRequests", requestLabel(request))
        await route.abort("blockedbyclient")
        return
      }
      const read = ["GET", "HEAD"].includes(request.method())
      const staticRead = url.pathname.startsWith("/_next/static/") && !url.pathname.split("/").includes("..") && knownQuery(url)
      const fontRead = url.pathname === "/__nextjs_font/geist-latin.woff2" && !url.search
      if (read && ((allowedPages.has(url.pathname) && knownQuery(url, true)) || staticRead || fontRead || (url.pathname === "/favicon.ico" && !url.search))) {
        admitted.set(request, { kind: "read", transition: stage, target: transitionTarget() })
        allowedReads++
        await route.continue()
        return
      }
      const contentType = request.headers()["content-type"] ?? ""
      if (request.method() === "POST" && postPath === url.pathname && !url.search && allowedPages.has(url.pathname)
        && request.headers().origin === ORIGIN && /^(multipart\/form-data;|application\/x-www-form-urlencoded(?:;|$)|text\/plain(?:;|$))/.test(contentType)
        && (request.postDataBuffer()?.byteLength ?? 0) <= 32_768) {
        allowedActions++
        // Auth explicitly redirects to /app; that route resolves the seeded workspace.
        admitted.set(request, { kind: "action", transition: stage, target: ["sign-in", "sign-in-again"].includes(stage) ? "/app" : transitionTarget() })
        await route.continue()
        return
      }
      problem("unexpectedRequests", requestLabel(request))
      await route.abort("blockedbyclient")
    })

    stage = "sign-in"
    await page.goto("/auth", { waitUntil: "load" })
    await expect(page.getByRole("heading", { level: 1, name: "Your account", exact: true })).toBeVisible()
    await layout("auth")
    await signIn()
    observations.signedIn = true
    const cookie = (await context.cookies(ORIGIN)).find((item) => item.name === "slides_session")
    observations.sessionCookie = { present: Boolean(cookie), httpOnly: cookie?.httpOnly ?? false, sameSite: cookie?.sameSite ?? null }
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe("Lax")
    stage = "session-reload"
    await page.reload({ waitUntil: "load" })
    await expect(page.getByRole("heading", { level: 1, name: "Core Growth", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible()
    observations.sessionReload = true
    completedTransitions.add(stage)

    stage = "seeded-editor"
    const row = page.locator("article").filter({ has: page.getByRole("heading", { name: "Slides operating system", exact: true }) })
    const open = row.getByRole("link", { name: "Open", exact: true })
    editorPath = await open.getAttribute("href")
    expect(editorPath).toMatch(/^\/app\/workspaces\/core-growth\/decks\/[A-Za-z0-9_-]{12}$/)
    allowedPages.add(editorPath!)
    await open.click()
    await expect(page).toHaveURL(`${ORIGIN}${editorPath}`)
    await expect(page.getByRole("heading", { level: 1, name: "Slides operating system", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save checkpoint", exact: true })).toBeEnabled()
    await page.waitForLoadState("load")
    observations.seedEditor = true
    await page.reload({ waitUntil: "load" })
    await expect(page.getByRole("heading", { level: 1, name: "Slides operating system", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save checkpoint", exact: true })).toBeEnabled()
    await layout("editor")
    observations.editorReload = true
    completedTransitions.add(stage)

    stage = "create-workspace"
    await page.goto(SEED_WORKSPACE, { waitUntil: "load" })
    await page.getByText("Workspace settings", { exact: true }).click()
    await page.getByPlaceholder("Launch campaigns", { exact: true }).fill(workspaceName)
    const description = `Authored durable PostgreSQL workspace for ${profile}.`
    await page.getByPlaceholder("Visualizations for a focused stream of work.", { exact: true }).fill(description)
    postPath = SEED_WORKSPACE
    await page.getByRole("button", { name: "Create workspace", exact: true }).click()
    await expect(page).toHaveURL(`${ORIGIN}${workspacePath}`)
    await expect(page.getByRole("heading", { level: 1, name: workspaceName, exact: true })).toBeVisible()
    await page.waitForLoadState("load")
    postPath = null
    observations.workspaceCreated = true
    completedTransitions.add(stage)
    stage = "workspace-reload"
    await page.reload({ waitUntil: "load" })
    await expect(page.getByRole("heading", { level: 1, name: workspaceName, exact: true })).toBeVisible()
    await expect(page.getByText(description, { exact: true })).toBeVisible()
    await expect(page.getByText("Nothing here yet — create your first draft above.", { exact: true })).toBeVisible()
    await layout("authored-workspace")
    observations.workspaceReload = true
    completedTransitions.add(stage)

    stage = "sign-out"
    postPath = workspacePath
    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(`${ORIGIN}/`)
    await page.waitForLoadState("load")
    postPath = null
    expect((await context.cookies(ORIGIN)).some((item) => item.name === "slides_session")).toBe(false)
    observations.signedOut = true
    completedTransitions.add(stage)
    stage = "protected-route"
    await page.goto(workspacePath, { waitUntil: "load" })
    await expect(page).toHaveURL(`${ORIGIN}/auth`)
    await expect(page.getByRole("heading", { level: 1, name: "Your account", exact: true })).toBeVisible()
    observations.protectedRedirect = true
    completedTransitions.add(stage)
    stage = "sign-in-again"
    await signIn()
    await page.goto(workspacePath, { waitUntil: "load" })
    await expect(page.getByRole("heading", { level: 1, name: workspaceName, exact: true })).toBeVisible()
    await expect(page.getByText(description, { exact: true })).toBeVisible()
    observations.workspaceAfterNewSession = true
    stage = "complete"
  } catch (error) {
    primary = error
  } finally {
    postPath = null
    try {
      await context.close()
      contextClosed = true
    } catch (error) {
      cleanupFailures.push(bounded(error))
    }
    await Promise.allSettled([...pending])
    await new Promise<void>((resolve) => setImmediate(resolve))
    for (const cancellation of navigationCancellations) {
      if (primary || stage !== "complete" || !completedTransitions.has(cancellation.transition) || observations.workspaceAfterNewSession !== true) {
        problem("requestFailures", `Unproven navigation cancellation ${cancellation.method} ${cancellation.path} transition=${cancellation.transition}`)
      }
    }
    const report = {
      schemaVersion: 1, kind: "iv-postgres-app-boundary", title: TITLE, profile, stage,
      status: !primary && Object.values(counts).every((count) => count === 0) && contextClosed && cleanupFailures.length === 0 ? "passed" : "failed",
      observations, primaryError: primary ? bounded(primary instanceof Error ? primary.message : primary, 4096) : null,
      boundary: { allowedReads, allowedActions, developmentWebSockets, counts, diagnostics, navigationCancellationCount: navigationCancellations.length, navigationCancellations },
      cleanup: { contextsCreated: 1, contextsClosed: Number(contextClosed), pendingJobs: pending.size, failures: cleanupFailures },
    }
    const bytes = Buffer.from(JSON.stringify(report), "utf8")
    expect.soft(bytes.byteLength, "bounded case attachment").toBeLessThanOrEqual(16_384)
    if (bytes.byteLength <= 16_384) await testInfo.attach("iv-postgres-app-boundary", { body: bytes, contentType: "application/json" })
    expect.soft(contextClosed, "owned browser context closed").toBe(true)
    expect.soft(pending.size, "all diagnostic jobs settled").toBe(0)
    expect.soft(cleanupFailures, "cleanup failures").toEqual([])
    expect.soft(counts, "network browser and server tripwires").toEqual({ unexpectedRequests: 0, unexpectedWebSockets: 0, requestFailures: 0, httpErrors: 0, pageErrors: 0, consoleErrors: 0, dialogs: 0 })
  }
  if (primary) throw primary
})
