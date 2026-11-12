import path from "node:path"
import { defineConfig } from "@playwright/test"
const root = process.env.IV_REMOVAL_CHECK_ROOT
if (process.env.CI !== "true" || !root || !path.isAbsolute(root) || process.env.NEXT_PUBLIC_APP_URL !== "http://127.0.0.1:3100") throw new Error("Requires owned disposable removal CI")
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "workspace-removals.spec.ts", forbidOnly: true, fullyParallel: false, workers: 1, retries: 0,
  timeout: 150_000, globalTimeout: 620_000, expect: { timeout: 15_000 },
  reporter: [["line"], ["json", { outputFile: path.join(root, "browser.json") }]], outputDir: path.join(root, "browser-output"), preserveOutput: "never",
  use: { browserName: "chromium", baseURL: "http://127.0.0.1:3100", acceptDownloads: false, storageState: { cookies: [], origins: [] }, serviceWorkers: "block",
    actionTimeout: 15_000, navigationTimeout: 45_000, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 1000 } } }, { name: "narrow-touch", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
})
