import { z } from "zod"
import { draftJson, WorkspaceDraftOriginError } from "@/lib/workspace-draft-http"
import { readPublicationBody } from "@/lib/workspace-publication-http"
import { WorkspaceDraftAccessError } from "@/packages/backend-contracts/workspace-drafts"

export const removalUuid = z.uuid().refine((value) => value === value.toLowerCase())
export const removalExpectedSchema = z.object({
  draftRevision: z.number().int().min(1).max(2_147_483_646), draftHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["draft", "preview", "published", "archived"]), publishedVersionId: removalUuid.nullable(),
}).strict()
export async function readWorkspaceRemovalInput(request: Request) {
  const parsed = z.object({ requestId: removalUuid, expected: removalExpectedSchema }).strict().safeParse(await readPublicationBody(request))
  if (!parsed.success) throw new WorkspaceDraftAccessError("INVALID_INPUT")
  return parsed.data
}
export function removalFailure(error: unknown) {
  if (error instanceof WorkspaceDraftOriginError) return draftJson({ code: "INVALID_ORIGIN", error: "Open the app at its configured address before removing saved work." }, 403)
  if (error instanceof WorkspaceDraftAccessError) {
    return draftJson({ code: error.code, error: error.code === "UNAUTHENTICATED" ? "Sign in to access saved work."
      : error.code === "FORBIDDEN" ? "Your current workspace role cannot remove saved work."
        : error.code === "NOT_FOUND" ? "This saved item is unavailable." : "The removal request could not be validated." },
    { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400 }[error.code])
  }
  return draftJson({ code: "REMOVAL_UNAVAILABLE", error: "Removal could not be confirmed. Keep this tab open and retry the same request." }, 503)
}
