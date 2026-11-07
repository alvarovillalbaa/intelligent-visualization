import { notFound } from "next/navigation"

import { DeckEditorClient } from "@/components/slides/deck-editor-client"
import { createSignedAccessUrl } from "@/lib/access-tokens"
import { getBaseUrl } from "@/lib/env"
import { repository } from "@/lib/repository"
import { currentPublicDeckVersion, publicDeckRequiresPassword } from "@/lib/public-deck-access"
import { requireSessionUser } from "@/lib/server-auth"
import { getPublishedArtifactUrl } from "@/lib/storage"

export default async function DeckEditorPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; deckId: string }>
}) {
  const { deckId } = await params
  const sessionUser = await requireSessionUser()
  const editorData = await repository.getDeckEditor(sessionUser.id, deckId)

  if (!editorData) {
    notFound()
  }

  const currentVersion = currentPublicDeckVersion(editorData.deck)
  const publicArtifactUrls = Object.fromEntries(
    currentVersion && !publicDeckRequiresPassword(editorData.deck)
      ? editorData.deck.versions
          .filter((version) => version.status === "published" && !version.passwordHash && Boolean(version.artifactUrl) && /^[A-Za-z0-9_-]{1,128}$/.test(version.id))
          .map((version): [string, string] => [version.id, getPublishedArtifactUrl(editorData.deck.publicId, version.id)])
      : [],
  )
  const artifactUrl = currentVersion?.artifactUrl
    ? `${getBaseUrl()}${createSignedAccessUrl({
        scope: "artifact",
        path: getPublishedArtifactUrl(editorData.deck.publicId, currentVersion.id),
        publicId: editorData.deck.publicId,
        versionId: currentVersion.id,
      })}`
    : null

  return (
    <div className="grid gap-8">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Deck editor</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-foreground">
          {editorData.deck.title}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          Prompt-based rewriting, direct slide editing, checkpoint history, review links, password-protected publishing, and analytics all live here.
        </p>
      </div>
      <DeckEditorClient
        sessionUser={editorData.sessionUser}
        deck={editorData.deck}
        shareUrls={{
          publicUrl: currentVersion ? `${getBaseUrl()}/d/${editorData.team.slug}/${editorData.deck.slug}` : null,
          embedUrl: currentVersion ? `${getBaseUrl()}${createSignedAccessUrl({
            scope: "embed",
            path: `/embed/${editorData.deck.publicId}`,
            publicId: editorData.deck.publicId,
          })}` : null,
          artifactUrl,
          publicArtifactUrls,
        }}
      />
    </div>
  )
}
