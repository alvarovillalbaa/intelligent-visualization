import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node", include: ["tests/unit/postgres-configuration.test.ts"],
    maxWorkers: 1, fileParallelism: false, retry: 0,
  },
})
