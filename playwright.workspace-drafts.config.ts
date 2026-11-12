import path from "node:path"
import { defineConfig } from "@playwright/test"

const origin = process.env.IV_WORKSPACE_APP_ORIGIN
const report = process.env.IV_WORKSPACE_BROWSER_REPORT
const output = process.env.IV_WORKSPACE_BROWSER_OUTPUT
if (origin !== "http://127.0.0.1:3100" || !report || !output || !path.isAbsolute(report) || !path.isAbsolute(output) || report === output) {
  throw new Error("Workspace draft checks require the owned loopback server and absolute report/output paths.")
}

export default defineConfig({
  testDir: "./tests/e2e", testMatch: "workspace-drafts.spec.ts",
  forbidOnly: true, fullyParallel: false, workers: 1, retries: 0,
  timeout: 120_000, globalTimeout: 600_000, expect: { timeout: 10_000 },
  reporter: [["line"], ["json", { outputFile: report }]],
  outputDir: output, preserveOutput: "never",
  use: {
    browserName: "chromium", baseURL: origin, acceptDownloads: false,
    storageState: { cookies: [], origins: [] }, serviceWorkers: "block",
    actionTimeout: 10_000, navigationTimeout: 30_000,
    trace: "off", screenshot: "off", video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false } },
    { name: "narrow-chromium", use: { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false } },
  ],
})
