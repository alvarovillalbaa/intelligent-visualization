import path from "path"

import { NextResponse } from "next/server"

import { readStoredFile } from "@/lib/storage"
import { resolveLegacyFileAccess } from "@/lib/legacy-file-access"
import { createLookupHash } from "@/lib/auth"
import { getSessionToken } from "@/lib/server-auth"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import { WORKSPACE_PUBLICATION_NAMESPACE } from "@/packages/backend-contracts/workspace-publications"

function getContentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    case ".md":
      return "text/markdown; charset=utf-8"
    case ".txt":
      return "text/plain; charset=utf-8"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    case ".svg":
      return "image/svg+xml"
    case ".mp4":
      return "video/mp4"
    case ".webm":
      return "video/webm"
    case ".pdf":
      return "application/pdf"
    default:
      return "application/octet-stream"
  }
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await params
  if (!Array.isArray(segments) || !segments.length || segments.some((segment) => !segment || segment === "." || segment === ".."
    || /[\\/\0]/.test(segment) || [WORKSPACE_PUBLICATION_NAMESPACE, "published", "legacy-slides"].includes(segment.toLowerCase()))) {
    return NextResponse.json({ error: "File not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  }
  const storageKey = segments.join("/")
  try {
    const token = await getSessionToken()
    const access = await (await getPersistenceProvider()).legacy.withState((state) => resolveLegacyFileAccess(state, storageKey, token ? createLookupHash(token) : null))
    if (!access) return NextResponse.json({ error: "File not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
    const content = await readStoredFile(storageKey)
    if (!content) return NextResponse.json({ error: "File not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
    const contentType = getContentType(storageKey)
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "content-type": contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
        "referrer-policy": "no-referrer",
        ...(/\.(?:html?|svg|xml)$/i.test(storageKey) ? { "content-disposition": "attachment" } : {}),
      },
    })
  } catch {
    return NextResponse.json({ error: "File storage is unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } })
  }
}
