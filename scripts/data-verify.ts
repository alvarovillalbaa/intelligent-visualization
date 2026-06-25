import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const input = getArg("--input")
  if (!input) throw new Error("Missing --input.")
  const manifest = JSON.parse(await fs.readFile(path.join(input, "manifest.json"), "utf8"))
  if (manifest.format !== "intelligent-visualization-portable") {
    throw new Error("Unsupported export format.")
  }
  const checksums = JSON.parse(await fs.readFile(path.join(input, "checksums.json"), "utf8")) as Record<string, string>
  const failures: string[] = []
  for (const [relativePath, expected] of Object.entries(checksums)) {
    const body = await fs.readFile(path.join(input, relativePath))
    const actual = createHash("sha256").update(body).digest("hex")
    if (actual !== expected) {
      failures.push(relativePath)
    }
  }
  if (failures.length > 0) {
    throw new Error(`Checksum verification failed for ${failures.join(", ")}.`)
  }
  console.log(JSON.stringify({ ok: true, input, filesChecked: Object.keys(checksums).length }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
