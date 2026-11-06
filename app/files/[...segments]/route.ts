import path from "path"

import { NextResponse } from "next/server"

import { readStoredFile } from "@/lib/storage"
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
    || /[\\/\0]/.test(segment) || segment.toLowerCase() === WORKSPACE_PUBLICATION_NAMESPACE)) {
    return NextResponse.json({ error: "File not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
  }
  const storageKey = segments.join("/")
  const content = await readStoredFile(storageKey)

  if (!content) {
    return NextResponse.json({ error: "File not found." }, { status: 404 })
  }

  return new NextResponse(content, {
    headers: {
      "content-type": getContentType(storageKey),
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
}
