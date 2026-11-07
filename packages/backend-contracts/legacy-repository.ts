import type { RepositoryState } from "@/lib/types"

// Server-only compatibility boundary. State and canonical commands share the
// selected provider's transaction and connection; no SQL client escapes here.
export interface LegacyRepository {
  withState<T>(work: (state: RepositoryState) => T | Promise<T>): Promise<T>
}
