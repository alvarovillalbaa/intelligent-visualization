const PREFIX = "default-src 'none'; script-src "
const SUFFIX = "; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin"
const SCRIPT_HASH = /^[A-Za-z0-9+/]{43}=$/

export function buildPublicationContentSecurityPolicy(scriptHashes: readonly string[]): string {
  if (scriptHashes.length > 8 || scriptHashes.some((hash) => !SCRIPT_HASH.test(hash)) || new Set(scriptHashes).size !== scriptHashes.length) {
    throw new Error("Invalid publication script hashes.")
  }
  return PREFIX + (scriptHashes.length ? scriptHashes.map((hash) => `'sha256-${hash}'`).join(" ") : "'none'") + SUFFIX
}

export function isPublicationContentSecurityPolicy(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1024 || !value.startsWith(PREFIX) || !value.endsWith(SUFFIX)) return false
  const source = value.slice(PREFIX.length, -SUFFIX.length)
  if (source === "'none'") return true
  const hashes = source.split(" ").map((entry) => /^'sha256-([A-Za-z0-9+/]{43}=)'$/.exec(entry)?.[1])
  return hashes.length > 0 && hashes.length <= 8 && hashes.every((hash): hash is string => Boolean(hash && SCRIPT_HASH.test(hash)))
    && new Set(hashes).size === hashes.length
}
