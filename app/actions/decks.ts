"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { generateDeckSource } from "@/lib/ai/generate-deck"
import { hashDeckPassword, requireSessionUser, verifyDeckPassword } from "@/lib/server-auth"
import { repository } from "@/lib/repository"
import type { DeckExperiment, DeckSource, GenerationInput, Role } from "@/lib/types"
import { getBaseUrl } from "@/lib/env"
import { slugify } from "@/lib/utils"
import { createPublicDeckAccessToken, currentPublicDeckPasswordHash, currentPublicDeckVersion, publicDeckRequiresPassword, PUBLIC_DECK_ACCESS_TTL_MS } from "@/lib/public-deck-access"

function requireDeckMutationRole(role: Role) {
  if (role === "viewer") {
    throw new Error("Viewer seats can review decks but cannot edit or publish them.")
  }
}

function requireAdminRole(role: Role) {
  if (role !== "admin") {
    throw new Error("Only admins can create or reorganize workspaces.")
  }
}

export async function createDeckFromGeneratedSourceAction(input: {
  workspaceId: string
  generationInput: GenerationInput
  source: DeckSource
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  const deck = await repository.createDeckFromGeneration(
    sessionUser.id,
    input.workspaceId,
    input.generationInput,
    input.source,
  )

  revalidatePath("/app")
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}`)

  return {
    deckId: deck.id,
  }
}

export async function createWorkspaceAction(formData: FormData) {
  const sessionUser = await requireSessionUser()
  requireAdminRole(sessionUser.role)

  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()

  if (!name) {
    throw new Error("Workspace name is required.")
  }

  const workspace = await repository.createWorkspace(sessionUser.id, {
    name,
    description,
  })

  revalidatePath("/app")
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}`)
  redirect(`/app/workspaces/${workspace.slug}`)
}

export async function inviteTeamMemberAction(formData: FormData) {
  const sessionUser = await requireSessionUser()
  requireAdminRole(sessionUser.role)

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const invitedName = String(formData.get("invitedName") ?? "").trim()
  const role = String(formData.get("role") ?? "viewer") as Role
  const workspaceId = String(formData.get("workspaceId") ?? "").trim()

  if (!email || !workspaceId) {
    throw new Error("Invite email and workspace are required.")
  }

  const invite = await repository.createInvite(sessionUser.id, {
    email,
    invitedName,
    role,
    workspaceId,
  })

  revalidatePath("/app")
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}`)

  return {
    inviteUrl: `${getBaseUrl()}/join/${invite.token}`,
  }
}

export async function updateTeamMemberRoleAction(formData: FormData) {
  const sessionUser = await requireSessionUser()
  requireAdminRole(sessionUser.role)

  const targetUserId = String(formData.get("targetUserId") ?? "").trim()
  const role = String(formData.get("role") ?? "").trim() as Role

  if (!targetUserId || !role) {
    throw new Error("Target user and role are required.")
  }

  if (targetUserId === sessionUser.id) {
    throw new Error("Change another teammate's role from this surface, not your own.")
  }

  await repository.updateTeamMemberRole(sessionUser.id, targetUserId, role)

  revalidatePath("/app")
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}`)
}

export async function saveDeckCheckpointAction(input: {
  deckId: string
  prompt: string
  title: string
  source: DeckSource
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  await repository.saveCheckpoint(sessionUser.id, input.deckId, input.source, input.prompt, input.title)
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${input.deckId}`)
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}`)
}

export async function publishDeckVersionAction(input: {
  deckId: string
  label: string
  source: DeckSource
  password?: string
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  const version = await repository.publishVersion(
    sessionUser.id,
    input.deckId,
    input.source,
    input.label,
    hashDeckPassword(input.password ?? ""),
  )

  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${input.deckId}`)
  revalidatePath(`/d/${sessionUser.teamSlug}/${slugify(version.source.title)}`)

  return version
}

export async function randomizeDeckThemeAction(deckId: string) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  const source = await repository.randomizeTheme(sessionUser.id, deckId)
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${deckId}`)
  return source
}

export async function restoreCheckpointAction(deckId: string, checkpointId: string) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  await repository.restoreCheckpoint(sessionUser.id, deckId, checkpointId)
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${deckId}`)
}

export async function createReviewLinkAction(input: {
  deckId: string
  versionId: string
  title: string
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  const review = await repository.createReviewRequest(
    sessionUser.id,
    input.deckId,
    input.versionId,
    input.title,
  )

  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${input.deckId}`)

  return {
    ...review,
    reviewUrl: `${getBaseUrl()}/review/${review.token}`,
  }
}

export async function addDeckAssetAction(input: {
  deckId: string
  kind: "image" | "video" | "document" | "code"
  title: string
  description: string
  url: string
  storageKey?: string
  contentType?: string
  sizeBytes?: number
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  await repository.addAsset(sessionUser.id, input.deckId, input)
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${input.deckId}`)
}

export async function saveDeckExperimentAction(input: {
  deckId: string
  experiment: Omit<DeckExperiment, "id"> | null
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  await repository.saveExperiment(sessionUser.id, input.deckId, input.experiment)
  revalidatePath(`/app/workspaces/${sessionUser.workspaceSlug}/decks/${input.deckId}`)
}

export async function addReviewCommentAction(input: {
  token: string
  authorName: string
  body: string
  slideId?: string
  status?: "comment" | "suggestion"
  suggestedPrompt?: string
  parentCommentId?: string
}) {
  await repository.addReviewComment(input.token, input)
  revalidatePath(`/review/${input.token}`)
}

export async function updateReviewStatusAction(input: {
  token: string
  status: "open" | "approved" | "changes_requested"
}) {
  await repository.updateReviewStatus(input.token, input.status)
  revalidatePath(`/review/${input.token}`)
}

export async function updateReviewCommentStatusAction(input: {
  token: string
  commentId: string
  status: "comment" | "resolved" | "suggestion"
}) {
  await repository.updateReviewComment(input.token, input.commentId, {
    status: input.status,
  })
  revalidatePath(`/review/${input.token}`)
}

export async function applyReviewSuggestionAction(input: {
  token: string
  commentId: string
}) {
  const sessionUser = await requireSessionUser()
  requireDeckMutationRole(sessionUser.role)
  const reviewView = await repository.getReviewView(input.token)
  if (!reviewView) {
    throw new Error("Review not found.")
  }

  const editorView = await repository.getDeckEditor(sessionUser.id, reviewView.deck.id)
  if (!editorView) {
    throw new Error("Deck not found.")
  }

  const comment = reviewView.review.comments.find((item) => item.id === input.commentId)
  if (!comment?.suggestedPrompt) {
    throw new Error("Suggestion not found.")
  }

  const generated = await generateDeckSource({
    inputKind: "paste",
    rawText: JSON.stringify(editorView.deck.source),
    prompt: comment.suggestedPrompt,
    files: [],
    themeMode: editorView.deck.themeMode,
  })

  await repository.saveCheckpoint(
    sessionUser.id,
    editorView.deck.id,
    generated.object,
    comment.suggestedPrompt,
    "Applied review suggestion",
  )
  await repository.updateReviewComment(input.token, input.commentId, {
    status: "resolved",
    appliedAt: Date.now(),
  })

  revalidatePath(`/review/${input.token}`)
  if (editorView.workspace) {
    revalidatePath(`/app/workspaces/${editorView.workspace.slug}/decks/${editorView.deck.id}`)
  }
}

export async function unlockDeckAction(input: { publicId: string; password: string }) {
  if (!input || typeof input.publicId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(input.publicId)
    || typeof input.password !== "string" || input.password.length > 4096) return { ok: false, error: "Invalid deck access request." }
  const view = await repository.getPublicDeckById(input.publicId)
  if (!view || !currentPublicDeckVersion(view.deck)) {
    return { ok: false, error: "Deck not found." }
  }

  if (!publicDeckRequiresPassword(view.deck)) return { ok: true }
  const passwordHash = currentPublicDeckPasswordHash(view.deck)
  if (!passwordHash || !verifyDeckPassword(input.password, passwordHash)) {
    return { ok: false, error: "Incorrect password." }
  }

  const cookieStore = await cookies()
  cookieStore.set(`slides_public_${view.deck.publicId}`, createPublicDeckAccessToken(view.deck), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PUBLIC_DECK_ACCESS_TTL_MS / 1000,
  })

  return { ok: true }
}
