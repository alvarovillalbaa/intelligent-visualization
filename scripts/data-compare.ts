export {}

function getArg(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const source = getArg("--source") ?? process.env.PERSISTENCE_PROVIDER ?? "local"
const destination = getArg("--destination") ?? "local"

if (source !== "local" || destination !== "local") {
  console.error(`Compare is only implemented for local->local in this build slice. Requested ${source}->${destination}.`)
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, source, destination, note: "Use data:export and data:verify for local parity checks." }, null, 2))
