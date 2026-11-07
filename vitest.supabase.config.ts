import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node", maxWorkers: 1, fileParallelism: false, retry: 0,
    testTimeout: 30000, hookTimeout: 30000,
    include: [
      "tests/providers/local-provider.test.ts", "tests/providers/postgres-invariants.test.ts",
      "tests/providers/legacy-postgres.test.ts", "tests/providers/portable-postgres.test.ts",
      "tests/providers/supabase-contracts.test.ts", "tests/integration/supabase-storage.test.ts",
      "tests/unit/supabase-storage.test.ts", "tests/unit/legacy-public-assets.test.ts",
      "tests/unit/public-deck-access.test.ts", "tests/unit/supabase-database.test.ts",
      "tests/unit/legacy-upload-ownership.test.ts",
    ],
  },
})
