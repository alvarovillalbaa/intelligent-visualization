const URL_PATTERN = /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/gi
const BARE_DOMAIN_PATTERN = /(^|\s)((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s<>()"']*)?(?=[\s.,;:!?]|$)/gi

// Bare domains (no scheme) are only trusted with a recognizable web TLD so that
// pasted filenames like notes.md or data.csv never become source URLs.
const BARE_TLD_ALLOWLIST = new Set([
  "com", "org", "net", "edu", "gov", "io", "ai", "co", "dev", "app", "so",
  "xyz", "me", "tv", "info", "biz", "site", "online", "store", "shop", "blog",
  "page", "tech", "design", "studio", "agency", "cloud", "digital", "news",
  "es", "fr", "de", "it", "nl", "eu", "us", "ca", "uk", "au", "ch", "se",
])

export function extractUrls(text: string): string[] {
  const found: string[] = []

  for (const match of text.matchAll(URL_PATTERN)) {
    found.push(match[0])
  }

  for (const match of text.matchAll(BARE_DOMAIN_PATTERN)) {
    const domain = match[2]
    const tld = domain.split(".").pop()?.toLowerCase() ?? ""
    if (!BARE_TLD_ALLOWLIST.has(tld)) {
      continue
    }

    const candidate = `https://${domain}${match[3] ?? ""}`
    try {
      new URL(candidate)
      found.push(candidate)
    } catch {
      // not a usable URL
    }
  }

  return Array.from(new Set(found))
}

export function urlDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
