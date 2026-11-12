import { NextResponse } from "next/server"
import { getPublicWorkspaceArtifact } from "@/lib/workspace-publications"
import { publicPublicationFailure, validPublicPublicationPath } from "@/lib/workspace-publication-http"

export async function GET(request: Request, context: { params: Promise<{ publicId: string; versionId: string }> }) {
  try {
    const { publicId, versionId } = await context.params
    if (new URL(request.url).search || !validPublicPublicationPath(publicId, versionId)) return publicPublicationFailure(404)
    const artifact = await getPublicWorkspaceArtifact(publicId, versionId)
    if (!artifact) return publicPublicationFailure(404)
    return new NextResponse(artifact.html, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Security-Policy": artifact.contentSecurityPolicy, "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", ETag: `"${artifact.rawHtmlHash}"`,
    } })
  } catch { return publicPublicationFailure(503) }
}
