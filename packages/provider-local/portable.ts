import {
  exportPortableDatabase as exportPostgresDatabase, importPortableDatabase as importPostgresDatabase,
  checkPortableDatabase as checkPostgresDatabase,
} from "@/packages/provider-postgres/portable"
import { createLocalPostgresContext, type LocalDatabase } from "./database"

export { PORTABLE_COLUMNS, PORTABLE_TABLES, readPortableBackup } from "@/packages/provider-postgres/portable"
export type { PortableTable } from "@/packages/provider-postgres/portable"

export function exportPortableDatabase(database: LocalDatabase, outputDirectory: string) {
  return exportPostgresDatabase(createLocalPostgresContext(database), outputDirectory)
}

export function importPortableDatabase(database: LocalDatabase, inputDirectory: string) {
  return importPostgresDatabase(createLocalPostgresContext(database), inputDirectory)
}

export function checkPortableDatabase(database: LocalDatabase, inputDirectory: string) {
  return checkPostgresDatabase(createLocalPostgresContext(database), inputDirectory)
}
