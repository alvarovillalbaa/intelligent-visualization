import { createLegacyOperations } from "@/lib/legacy-operations"
import { createSeedState } from "@/lib/seed"

// Explicit in-memory test fixture. Application requests use the PostgreSQL repository.
const state = createSeedState()

export const demoStore = {
  ...createLegacyOperations(state),
  reset() {
    Object.assign(state, createSeedState())
  },
}
