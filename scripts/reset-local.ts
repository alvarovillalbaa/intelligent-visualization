import { promises as fs } from "node:fs"
import path from "node:path"

const databasePath = process.env.LOCAL_DATABASE_PATH ?? ".data/intelligent-visualization.sqlite"
const storageDir = process.env.LOCAL_STORAGE_DIR ?? ".data/storage"

async function main() {
  await fs.rm(databasePath, { force: true })
  await fs.rm(`${databasePath}-shm`, { force: true })
  await fs.rm(`${databasePath}-wal`, { force: true })
  await fs.rm(storageDir, { recursive: true, force: true })
  await fs.mkdir(path.dirname(databasePath), { recursive: true })
  await fs.mkdir(storageDir, { recursive: true })
  console.log(JSON.stringify({ ok: true, databasePath, storageDir }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
