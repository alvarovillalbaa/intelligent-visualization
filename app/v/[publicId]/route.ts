import { NextResponse } from "next/server"
import { getPublicWorkspaceArtifact } from "@/lib/workspace-publications"
import { publicPublicationFailure, validPublicPublicationPath } from "@/lib/workspace-publication-http"

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await context.params
    if (new URL(request.url).search || !validPublicPublicationPath(publicId)) return publicPublicationFailure(404)
    const artifact = await getPublicWorkspaceArtifact(publicId)
    if (!artifact) return publicPublicationFailure(404)
    // A relative redirect preserves the actual browser origin despite NextURL's
    // loopback normalization, without trusting a Host/forwarded-header override.
    return new NextResponse(null, { status: 307, headers: { Location: `/v/${publicId}/${artifact.reference.versionId}`, "Cache-Control": "no-store" } })
  } catch { return publicPublicationFailure(503) }
}
