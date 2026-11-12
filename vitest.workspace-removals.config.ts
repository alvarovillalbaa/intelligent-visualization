import path from "node:path"
import { defineConfig } from "vitest/config"
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node", include: ["tests/unit/workspace-removals.test.ts", "tests/integration/workspace-removals-postgres.test.ts"],
    maxWorkers: 1, fileParallelism: false, retry: 0, testTimeout: 30_000, hookTimeout: 30_000 },
})
