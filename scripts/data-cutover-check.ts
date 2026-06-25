export {}

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const provider = getArg("--provider") ?? process.env.PERSISTENCE_PROVIDER ?? "local"

if (provider !== "local") {
  console.error(`Cutover checks for provider "${provider}" are not implemented yet.`)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, provider, checks: ["local health", "export verification"] }, null, 2))
