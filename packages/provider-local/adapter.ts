import { PostgresPersistenceProvider } from "@/packages/provider-postgres/adapter"
import { createLocalPostgresContext, createPostgresDatabase, getLocalDatabase } from "./database"

export interface LocalPersistenceOptions {
  connectionString?: string
}

export class LocalPersistenceProvider extends PostgresPersistenceProvider {
  readonly kind = "local" as const

  constructor(options: LocalPersistenceOptions = {}) {
    const database = options.connectionString !== undefined ? createPostgresDatabase(options.connectionString) : getLocalDatabase()
    super(createLocalPostgresContext(database))
  }
}

export function createLocalPersistenceProvider(options?: LocalPersistenceOptions) {
  return new LocalPersistenceProvider(options)
}
