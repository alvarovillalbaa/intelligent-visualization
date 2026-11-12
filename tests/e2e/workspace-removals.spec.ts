import { createHash, randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { createStarterCourseDocument, createStarterReportDocument } from "../../packages/domain/fixtures"

const ORIGIN = "http://127.0.0.1:3100", WORKSPACE = "/app/workspaces/core-growth", API = "/api/workspaces/core-growth/visualizations"
async function storage() {
  const root = process.env.LOCAL_STORAGE_DIR!, result: Record<string, { bytes: number; sha256: string }> = {}
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      expect(entry.isSymbolicLink()).toBe(false)
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else { const body = await readFile(file); expect(body.length).toBeLessThan(8 * 1024 * 1024); result[path.relative(root, file)] = { bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") } }
    }
  }
  await walk(root); expect(Object.keys(result).length).toBeLessThan(32); return result
}
for (const kind of ["course", "report"] as const) test(`${kind} removal retains dirty work and artifacts through conflict and a lost acknowledgement`, async ({ page, context, browser }, info) => {
  const id = randomUUID(), removal = `${API}/${id}/removal`, saved = `${WORKSPACE}/visualizations/${id}`, unexpected: string[] = []
  const label = kind === "course" ? "Course" : "Report", title = `Authored ${label} removal ${info.project.name}`, changedTitle = title + " saved again", dirtyTitle = title + " unsaved"
  let lost = false; const attempts: string[] = [], accepted: unknown[] = []
  const local = (raw: string) => { const url = new URL(raw); expect(url.origin).toBe(ORIGIN); expect(url.username + url.password + url.hash).toBe(""); return url }
  await context.routeWebSocket("**/*", (route) => {
    const url = new URL(route.url())
    if (url.protocol === "ws:" && url.host === "127.0.0.1:3100" && url.pathname === "/_next/webpack-hmr") route.connectToServer()
    else { unexpected.push("websocket:" + url.origin); route.close() }
  })
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url())
    const permitted = url.origin === ORIGIN && !url.username && !url.password && !url.hash && (
      ["/auth", "/app", WORKSPACE, saved, "/favicon.ico", "/__nextjs_font/geist-latin.woff2"].includes(url.pathname)
      || url.pathname.startsWith("/_next/static/") || [API, `${API}/${id}`, `${API}/${id}/publications`, removal].includes(url.pathname))
    if (!permitted || url.pathname === "/api/events") { unexpected.push(request.method() + ":" + url.pathname); await route.abort(); return }
    if (url.pathname === removal && request.method() === "POST") {
      attempts.push(request.postData() ?? "")
      if (lost) {
        lost = false
        const response = await route.fetch(); expect(response.status()).toBe(200); accepted.push(await response.json()); await response.dispose()
        await route.abort("failed"); return
      }
    }
    await route.continue()
  })
  let dirty: Awaited<ReturnType<typeof context.newPage>> | undefined, anon: Awaited<ReturnType<typeof browser.newContext>> | undefined
  try {
    await page.goto("/auth")
    await page.locator("#sign-in-email").fill("morgan@northstarlabs.com"); await page.locator("#sign-in-password").fill("demo1234")
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(ORIGIN + WORKSPACE)
    const document = kind === "course" ? createStarterCourseDocument() : createStarterReportDocument(); document.title = title
    const seed = await context.request.post(ORIGIN + API, { headers: { Origin: ORIGIN }, data: { id, requestId: randomUUID(), expectedRevision: 0, document } })
    expect(seed.status()).toBe(200); await seed.dispose()
    await page.goto(saved); await page.getByRole("button", { name: "Publish saved revision", exact: true }).click()
    await page.getByRole("button", { name: "Confirm publish", exact: true }).click()
    const live = page.getByRole("link", { name: "Open current public version", exact: true }), immutable = page.getByRole("link", { name: "Open immutable published version", exact: true })
    await expect(live).toBeVisible(); const paths = [await live.getAttribute("href"), await immutable.getAttribute("href")].map((url) => { expect(url).toBeTruthy(); return local(ORIGIN + url).pathname })
    anon = await browser.newContext({ baseURL: ORIGIN, storageState: { cookies: [], origins: [] }, serviceWorkers: "block" })
    for (const url of paths) { const response = await anon.request.get(url); expect(response.status()).toBe(200); expect((await response.body()).length).toBeGreaterThan(100); await response.dispose() }
    const filesBefore = await storage()
    dirty = await context.newPage(); await dirty.goto(saved)
    await dirty.getByRole("button", { name: `Edit ${label}`, exact: true }).click()
    const titleField = kind === "course" ? dirty.getByLabel("Title", { exact: true }) : dirty.getByLabel("Report title", { exact: true })
    await titleField.fill(dirtyTitle); await dirty.getByRole("button", { name: "Apply changes", exact: true }).click()
    await expect(dirty.getByRole("heading", { name: dirtyTitle, exact: true })).toBeVisible()
    await page.goto(WORKSPACE)
    const row = page.getByRole("article", { name: `Saved ${label}: ${title}`, exact: true })
    await row.getByRole("button", { name: "Remove from workspace", exact: true }).click()
    const dialog = page.getByRole("dialog"); await expect(dialog.getByText(/saved revision 1/)).toBeVisible()
    await expect(dialog).toContainText("remain retained"); await expect(dialog).toContainText("cannot be undone")
    document.title = changedTitle
    const save = await context.request.post(ORIGIN + API, { headers: { Origin: ORIGIN }, data: { id, requestId: randomUUID(), expectedRevision: 1, document } })
    expect(save.status()).toBe(200); await save.dispose()
    await dialog.getByRole("button", { name: "Confirm removal", exact: true }).click()
    await expect(dialog.getByRole("alert")).toContainText("changed after you reviewed")
    await dialog.getByRole("button", { name: "Load latest saved state", exact: true }).click()
    await expect(dialog.getByText(/saved revision 2/)).toContainText(changedTitle)
    const size = await dialog.boundingBox(); expect(size).toBeTruthy(); expect(size!.width).toBeLessThanOrEqual(info.project.use.viewport!.width)
    await page.screenshot({ path: path.join(process.env.IV_REMOVAL_CHECK_ROOT!, `${kind}-${info.project.name}.png`) })
    lost = true; await dialog.getByRole("button", { name: "Confirm removal", exact: true }).click()
    await expect(dialog.getByRole("button", { name: "Retry same removal", exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toHaveCount(0)
    await expect(row.getByRole("link")).toHaveCount(0)
    await dialog.getByRole("button", { name: "Retry same removal", exact: true }).click()
    await expect(dialog).toHaveCount(0); await expect(page.getByRole("article", { name: `Saved ${label}: ${changedTitle}`, exact: true })).toHaveCount(0)
    expect(attempts.length).toBe(3); expect(attempts[1]).toBe(attempts[2]); expect(attempts[0]).not.toBe(attempts[1]); expect(accepted).toHaveLength(1)
    for (const url of paths) for (const method of ["GET", "HEAD"]) for (const conditional of [false, true]) {
      const response = await anon.request.fetch(url, { method, headers: conditional ? { "If-None-Match": "*", "If-Modified-Since": new Date().toUTCString() } : {} })
      expect(response.status()).toBe(404); expect(response.headers()["cache-control"]).toBe("private, no-store"); expect(response.headers()["x-content-type-options"]).toBe("nosniff")
      const bytes = await response.body(); expect(bytes.length).toBeLessThan(4096); if (method === "HEAD") expect(bytes.length).toBe(0); await response.dispose()
    }
    const refused = dirty.waitForResponse((r) => r.url() === ORIGIN + API && r.request().method() === "POST")
    await dirty.getByRole("button", { name: "Save revision", exact: true }).click(); expect((await refused).status()).toBe(404)
    await expect(dirty.getByRole("heading", { name: dirtyTitle, exact: true })).toBeVisible()
    await expect(dirty.getByRole("region", { name: `Saved ${label}`, exact: true }).getByRole("alert")).toBeVisible()
    expect(await storage()).toEqual(filesBefore)
    await page.reload(); await expect(page.getByRole("article", { name: new RegExp(`Saved ${label}: Authored`) })).toHaveCount(0)
    expect(unexpected).toEqual([])
    console.log("IV_REMOVAL_BROWSER", JSON.stringify({ kind, project: info.project.name, attempts: attempts.map((body) => ({ bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") })), accepted, retainedFiles: filesBefore, publicRefusals: 8, dirtyCopyRetained: true }))
  } finally {
    if (dirty) { dirty.on("dialog", (dialog) => void dialog.dismiss()); await dirty.close({ runBeforeUnload: false }) }
    await anon?.close()
  }
})
