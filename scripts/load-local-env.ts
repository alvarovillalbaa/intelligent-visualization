import { existsSync } from "node:fs"
import { loadEnvFile } from "node:process"

// Existing process variables win; the first file also wins over the second.
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue
  try {
    loadEnvFile(file)
  } catch {
    throw new Error("Could not load the local environment file. Check its permissions and format.")
  }
}
