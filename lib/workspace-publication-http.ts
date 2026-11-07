import { NextResponse } from "next/server"
import { z } from "zod"
import { draftJson, requireWorkspaceDraftOrigin, WorkspaceDraftOriginError } from "@/lib/workspace-draft-http"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

const uuid = z.uuid().refine((value) => value === value.toLowerCase())
export const workspacePublicationPathId = uuid
const bodySchema = z.object({ requestId: uuid, versionId: uuid,
  expectedRevision: z.number().int().min(1).max(2_147_483_646), expectedDraftHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
const unpublishBodySchema = z.object({ requestId: uuid, expectedCurrentVersionId: uuid }).strict()
export const WORKSPACE_PUBLICATION_BODY_LIMIT = 16 * 1024

async function readPublicationBody(request: Request): Promise<unknown> {
  requireWorkspaceDraftOrigin(request)
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "") || !request.body) {
    throw new WorkspaceDraftAccessError("INVALID_INPUT")
  }
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > WORKSPACE_PUBLICATION_BODY_LIMIT) {
        await reader.cancel()
        throw new WorkspaceDraftAccessError("INVALID_INPUT")
      }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
  } catch { throw new WorkspaceDraftAccessError("INVALID_INPUT") }
}

export async function readWorkspacePublicationInput(request: Request) {
  const parsed = bodySchema.safeParse(await readPublicationBody(request))
  if (!parsed.success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
  return parsed.data
}

export async function readWorkspaceUnpublicationInput(request: Request) {
  const parsed = unpublishBodySchema.safeParse(await readPublicationBody(request))
  if (!parsed.success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
  return parsed.data
}

export function publicationFailure(error: unknown, operation: "publish" | "unpublish" = "publish") {
  if (error instanceof WorkspaceDraftOriginError) return draftJson({ code: "INVALID_ORIGIN", error: operation === "unpublish"
    ? "Open the app at its configured address before unpublishing." : "Open the app at its configured address before publishing." }, 403)
  if (error instanceof WorkspaceDraftAccessError) {
    const status = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400 }[error.code]
    return draftJson({ code: error.code, error: error.code === "FORBIDDEN" ? operation === "unpublish"
      ? "Your current workspace role cannot unpublish this visualization." : "Your current workspace role cannot publish this saved revision."
      : error.code === "INVALID_INPUT" ? "The publication request could not be validated."
        : error.code === "NOT_FOUND" ? "This workspace publication is unavailable." : "Sign in to access workspace publications." }, status)
  }
  return draftJson({ code: "PUBLICATION_UNAVAILABLE", error: operation === "unpublish"
    ? "Unpublishing could not be confirmed. Retry this same unpublish request before starting another."
    : "Publishing could not be confirmed. Retry this same publication before starting another." }, 503)
}

export function publicPublicationFailure(status: 404 | 503) {
  return NextResponse.json({ error: status === 404 ? "Published visualization not found." : "This publication is temporarily unavailable." },
    { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
}

export function validPublicPublicationPath(publicId: string, versionId?: string) {
  return /^(course|report)_[0-9a-f]{32}$/.test(publicId) && (versionId === undefined || uuid.safeParse(versionId).success)
}
