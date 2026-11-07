import path from "node:path"
import { defineConfig } from "@playwright/test"

const origin = process.env.IV_SUPABASE_APP_ORIGIN
const root = process.env.IV_SUPABASE_APPLICATION_ROOT
const fixtures = process.env.IV_SUPABASE_APP_FIXTURES
const report = process.env.IV_SUPABASE_BROWSER_REPORT
const output = process.env.IV_SUPABASE_BROWSER_OUTPUT
if (origin !== "http://localhost:3100" || !root || !fixtures || !report || !output
  || [root, fixtures, report, output].some((value) => !path.isAbsolute(value))
  || [fixtures, report, output].some((value) => !path.relative(root, value) || path.relative(root, value).startsWith("..") || path.isAbsolute(path.relative(root, value)))
  || new Set([fixtures, report, output]).size !== 3) {
  throw new Error("Supabase application checks require owned loopback and distinct absolute runner paths.")
}

export default defineConfig({
  testDir: "./tests/e2e", testMatch: "supabase-application.spec.ts",
  forbidOnly: true, fullyParallel: false, workers: 1, retries: 0,
  timeout: 180_000, globalTimeout: 720_000, expect: { timeout: 10_000 },
  reporter: [["line"], ["json", { outputFile: report }]], outputDir: output, preserveOutput: "never",
  use: {
    browserName: "chromium", baseURL: origin, acceptDownloads: false,
    storageState: { cookies: [], origins: [] }, serviceWorkers: "block",
    actionTimeout: 10_000, navigationTimeout: 30_000, trace: "off", screenshot: "off", video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false } },
    { name: "narrow-chromium", use: { viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false } },
  ],
})
