import { readPortableBackup } from "@/packages/provider-local/portable"

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
function canonical(value: unknown): string {
  const ordered = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(ordered)
    : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)])) : entry
  return JSON.stringify(ordered(value))
}
async function main() {
  const left = argument("--left"), right = argument("--right")
  if (!left || !right) throw new Error("Two backup paths are required.")
  const [a, b] = await Promise.all([readPortableBackup(left), readPortableBackup(right)])
  for (const table of Object.keys(a.entities) as Array<keyof typeof a.entities>) {
    if (JSON.stringify(a.entities[table].map(canonical).sort()) !== JSON.stringify(b.entities[table].map(canonical).sort())) {
      throw new Error("Database entities differ.")
    }
  }
  console.log(JSON.stringify({ ok: true, compared: "database entity counts and values", tables: Object.keys(a.entities).length,
    objectsCompared: false, sessionsCompared: false }, null, 2))
}
main().catch(() => {
  console.error("Database backup comparison failed. Supply --left and --right verified backup directories with identical entity data.")
  process.exitCode = 1
})
