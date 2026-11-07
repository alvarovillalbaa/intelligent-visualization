import { nanoid } from "nanoid"

import { createLegacyOperations } from "@/lib/legacy-operations"
import { getPersistenceProvider } from "@/lib/persistence/factory"
import type {
  AnalyticsEvent,
  AssetRecord,
  DeckExperiment,
  DeckRecord,
  GenerationInput,
  LeadRecord,
  ReviewRequest,
  ReviewView,
  SessionRecord,
  TeamInviteRecord,
} from "@/lib/types"
import { slugify } from "@/lib/utils"

type LegacyOperations = ReturnType<typeof createLegacyOperations>

async function operate<T>(work: (operations: LegacyOperations) => T | Promise<T>): Promise<T> {
  const provider = await getPersistenceProvider()
  return provider.legacy.withState((state) => work(createLegacyOperations(state)))
}

export const repository = {
  async getUserByEmail(email: string) {
    return operate((operations) => operations.getUserByEmail(email))
  },

  async createUser(input: {
    name: string
    email: string
    passwordHash: string
    teamName: string
  }) {
    return operate((operations) => {
      if (operations.getUserByEmail(input.email)) throw new Error("That email already has an account.")
      return operations.createUser(input)
    })
  },

  async createSession(input: Omit<SessionRecord, "id">) {
    return operate((operations) => operations.createSession({ id: nanoid(12), ...input }))
  },

  async deleteSession(tokenHash: string) {
    return operate((operations) => operations.deleteSession(tokenHash))
  },

  async getSessionUser(tokenHash: string) {
    return operate((operations) => operations.getSessionUser(tokenHash))
  },

  async getDashboard(userId: string) {
    return operate((operations) => operations.getDashboard(userId))
  },

  async getWorkspaceBySlug(userId: string, workspaceSlug: string) {
    return operate((operations) => operations.getWorkspaceBySlug(userId, workspaceSlug))
  },

  async getDeckEditor(userId: string, deckId: string) {
    return operate((operations) => operations.getDeckEditor(userId, deckId))
  },

  async createWorkspace(userId: string, input: { name: string; description: string }) {
    return operate((operations) => {
      const dashboard = operations.getDashboard(userId)
      if (!dashboard) throw new Error("Unable to load dashboard")
      const baseSlug = slugify(input.name)
      const existingSlugs = new Set(dashboard.team.workspaces.map((workspace) => workspace.slug))
      let slug = baseSlug
      let suffix = 2
      while (existingSlugs.has(slug)) {
        slug = `${baseSlug.slice(0, 58)}-${suffix}`
        suffix += 1
      }
      return operations.createWorkspace(userId, { ...input, slug })
    })
  },

  async createInvite(userId: string, input: {
    email: string
    invitedName: string
    role: TeamInviteRecord["role"]
    workspaceId: string
  }) {
    return operate((operations) => {
      const dashboard = operations.getDashboard(userId)
      if (!dashboard) throw new Error("Unable to load dashboard")
      if (!dashboard.team.workspaces.some((workspace) => workspace.id === input.workspaceId)) {
        throw new Error("Workspace not found.")
      }
      return operations.createInvite(userId, input)
    })
  },

  async getInviteByToken(token: string) {
    return operate((operations) => operations.getInviteByToken(token))
  },

  async acceptInvite(input: {
    token: string
    name: string
    passwordHash: string
  }) {
    return operate((operations) => operations.acceptInvite(input))
  },

  async updateTeamMemberRole(userId: string, targetUserId: string, role: TeamInviteRecord["role"]) {
    return operate((operations) => {
      const dashboard = operations.getDashboard(userId)
      if (!dashboard) throw new Error("Unable to load dashboard")
      if (!dashboard.team.members.some((member) => member.userId === targetUserId)) {
        throw new Error("Team member not found.")
      }
      return operations.updateTeamMemberRole(userId, targetUserId, role)
    })
  },

  async createDeckFromGeneration(userId: string, workspaceId: string, input: GenerationInput, source: DeckRecord["source"]) {
    return operate((operations) => operations.createDeckFromGeneration(userId, workspaceId, input, source))
  },

  async saveCheckpoint(userId: string, deckId: string, source: DeckRecord["source"], prompt: string, title: string) {
    return operate((operations) => operations.saveCheckpoint(userId, deckId, source, prompt, title))
  },

  async publishVersion(userId: string, deckId: string, source: DeckRecord["source"], label: string, passwordHash?: string) {
    return operate((operations) => operations.publishVersion(userId, deckId, source, label, passwordHash))
  },

  async randomizeTheme(userId: string, deckId: string) {
    return operate((operations) => operations.randomizeTheme(userId, deckId))
  },

  async restoreCheckpoint(userId: string, deckId: string, checkpointId: string) {
    return operate((operations) => operations.restoreCheckpoint(userId, deckId, checkpointId))
  },

  async createReviewRequest(userId: string, deckId: string, versionId: string, title: string) {
    return operate((operations) => operations.createReviewRequest(userId, deckId, versionId, title))
  },

  async addAsset(userId: string, deckId: string, asset: Omit<AssetRecord, "id">) {
    return operate((operations) => operations.addAsset(userId, deckId, asset))
  },

  async saveExperiment(userId: string, deckId: string, experiment: Omit<DeckExperiment, "id"> | null) {
    return operate((operations) => operations.saveExperiment(userId, deckId, experiment))
  },

  async addReviewComment(token: string, input: {
    authorName: string
    body: string
    slideId?: string
    status?: "comment" | "suggestion"
    suggestedPrompt?: string
    parentCommentId?: string
  }) {
    return operate((operations) => operations.addReviewComment(token, input))
  },

  async updateReviewStatus(token: string, status: ReviewRequest["status"]) {
    return operate((operations) => operations.updateReviewStatus(token, status))
  },

  async updateReviewComment(
    token: string,
    commentId: string,
    patch: Partial<Pick<ReviewRequest["comments"][number], "status" | "appliedAt">>,
  ) {
    return operate((operations) => operations.updateReviewComment(token, commentId, patch))
  },

  async getPublicDeck(teamSlug: string, deckSlug: string) {
    return operate((operations) => operations.getPublicDeck(teamSlug, deckSlug))
  },

  async getPublicDeckById(publicId: string) {
    return operate((operations) => operations.getPublicDeckById(publicId))
  },

  async getReviewView(token: string): Promise<ReviewView | null> {
    return operate((operations) => operations.getReviewView(token))
  },

  async recordEvent(event: AnalyticsEvent) {
    return operate((operations) => operations.recordEvent(event))
  },

  async captureLead(lead: LeadRecord) {
    return operate((operations) => operations.captureLead(lead))
  },
}
