import { NextResponse } from "next/server"
import { z } from "zod"

import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

export const WORKSPACE_DRAFT_BODY_LIMIT = 2 * 1024 * 1024
export class WorkspaceDraftOriginError extends Error {}
export const workspaceDraftInputSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  document: z.unknown(),
}).strict()

export function draftJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } })
}

export function draftFailure(error: unknown) {
  if (error instanceof WorkspaceDraftOriginError) return draftJson({ code: "INVALID_ORIGIN", error: "Open the app at its configured address before saving." }, 403)
  if (error instanceof WorkspaceDraftAccessError) {
    const status = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400 }[error.code]
    return draftJson({ code: error.code, error: error.message }, status)
  }
  return draftJson({ code: "DRAFT_UNAVAILABLE", error: "The draft response could not be confirmed. Keep your edits and retry the same save." }, 503)
}

export function requireWorkspaceDraftOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured) throw new Error("Workspace draft origin is not configured.")
  const app = new URL(configured)
  if (!["http:", "https:"].includes(app.protocol) || app.username || app.password || app.search || app.hash || app.pathname !== "/") {
    throw new Error("Workspace draft origin configuration is invalid.")
  }
  // NextRequest normalizes loopback hosts. Only the operator's configured origin is trusted.
  if (request.headers.get("origin") !== app.origin) throw new WorkspaceDraftOriginError()
}

export async function readWorkspaceDraftInput(request: Request) {
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
      if (bytes > WORKSPACE_DRAFT_BODY_LIMIT) {
        await reader.cancel()
        throw new WorkspaceDraftAccessError("INVALID_INPUT")
      }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  try {
    const data = Buffer.concat(chunks).toString("utf8")
    if (!Buffer.from(data).equals(Buffer.concat(chunks))) throw new Error("Invalid UTF-8")
    const input = workspaceDraftInputSchema.safeParse(JSON.parse(data))
    if (!input.success || !Object.hasOwn(input.data, "document")) throw new Error("Invalid request")
    return input.data
  } catch { throw new WorkspaceDraftAccessError("INVALID_INPUT") }
}
