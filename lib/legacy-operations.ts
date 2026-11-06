import { nanoid } from "nanoid"

import { buildInitialDeckAssets, buildStoredInputAssets } from "@/lib/deck-assets"
import { buildStandaloneDeckHtml, remixTheme, themeLibrary } from "@/lib/deck-runtime"
import { writePublishedArtifact, writeStoredText } from "@/lib/storage"
import type {
  AnalyticsEvent,
  AssetRecord,
  DashboardData,
  DeckCheckpoint,
  DeckExperiment,
  DeckRecord,
  DeckVersion,
  GenerationInput,
  LeadRecord,
  PublicDeckView,
  RepositoryState,
  ReviewRequest,
  ReviewView,
  SessionRecord,
  SessionUser,
  TeamInviteRecord,
  TeamRecord,
  UserRecord,
} from "@/lib/types"
import { slugify } from "@/lib/utils"

export function createLegacyOperations(state: RepositoryState) {
  function createEmptyAnalytics(): DeckRecord["analytics"] {
    return {
      views: 0,
      uniqueVisitors: 0,
      completionRate: 0,
      avgTimeSeconds: 0,
      ctaClicks: 0,
      leads: 0,
      slideViews: {},
      pollVotes: {},
      variantMetrics: {},
    }
  }

  function cloneState<T>(value: T): T {
    return JSON.parse(JSON.stringify(value))
  }

  function findUserById(userId: string) {
    return state.users.find((user) => user.id === userId)
  }

  function findTeam(teamId: string) {
    return state.teams.find((team) => team.id === teamId)
  }

  function findWorkspace(workspaceId: string) {
    return state.workspaces.find((workspace) => workspace.id === workspaceId)
  }

  function findDeck(deckId: string) {
    return state.decks.find((deck) => deck.id === deckId)
  }

  function toSessionUser(user: UserRecord): SessionUser {
    const team = findTeam(user.teamId)
    const workspace = findWorkspace(user.workspaceId)

    if (!team || !workspace) {
      throw new Error("Corrupted demo state")
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teamId: team.id,
      teamName: team.name,
      teamSlug: team.slug,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
    }
  }

  function refreshWorkspaceDecks(team: TeamRecord, deck: DeckRecord) {
    const workspace = state.workspaces.find((item) => item.id === deck.workspaceId)
    if (!workspace) {
      return
    }

    workspace.decks = state.decks.filter((item) => item.workspaceId === workspace.id)
    team.workspaces = state.workspaces.filter((item) => item.teamId === team.id)
  }

  function withTeamWorkspaces(team: TeamRecord) {
    return {
      ...team,
      invites: state.invites.filter((invite) => invite.teamId === team.id),
      workspaces: state.workspaces
        .filter((workspace) => workspace.teamId === team.id)
        .map((workspace) => ({
          ...workspace,
          decks: state.decks.filter((deck) => deck.workspaceId === workspace.id),
        })),
    }
  }

  async function persistInputFiles(teamSlug: string, deckPublicId: string, files: GenerationInput["files"]) {
    return Promise.all(
      files.map(async (file) => {
        const stored = await writeStoredText({
          namespace: ["uploads", teamSlug, deckPublicId, "sources"],
          fileName: file.name,
          content: file.content,
          contentType: file.type || "text/plain",
        })

        return {
          fileName: file.name,
          url: stored.url,
          storageKey: stored.storageKey,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
        }
      }),
    )
  }

  async function createVersionFromSource(
    publicId: string,
    source: DeckRecord["source"],
    label: string,
    status: DeckVersion["status"] = "published",
  ): Promise<DeckVersion> {
    const versionId = nanoid(12)
    const artifactHtml = buildStandaloneDeckHtml(source, slugify(source.title), {
      publicId,
      versionId,
    })
    const storedArtifact = await writePublishedArtifact({
      publicId,
      versionId,
      html: artifactHtml,
      metadata: {
        deckTitle: source.title,
        label,
        createdAt: Date.now(),
      },
    })

    return {
      id: versionId,
      label,
      createdAt: Date.now(),
      status,
      source,
      artifactHtml,
      artifactStorageKey: storedArtifact.artifactStorageKey,
      artifactUrl: storedArtifact.artifactUrl,
    }
  }

  function createCheckpoint(source: DeckRecord["source"], prompt: string, title?: string): DeckCheckpoint {
    return {
      id: nanoid(10),
      title: title ?? "Saved checkpoint",
      summary: source.summary,
      prompt,
      createdAt: Date.now(),
      source,
    }
  }

  function accumulateAnalytics(deckId: string) {
    const deck = findDeck(deckId)
    if (!deck) {
      return
    }

    const events = state.events.filter((event) => event.deckId === deckId)
    const leads = state.leads.filter((lead) => lead.deckId === deckId)
    const slideViews: Record<string, number> = {}
    const pollVotes: Record<string, number> = {}
    const viewVisitorIds = new Set<string>()
    const completionVisitorIds = new Set<string>()
    const durations: number[] = []
    const variantVisitorIds = new Map<string, Set<string>>()
    const variantCompletionIds = new Map<string, Set<string>>()
    const variantDurations = new Map<string, number[]>()
    const variantMetrics = new Map<string, DeckRecord["analytics"]["variantMetrics"][string]>()

    for (const event of events) {
      if (event.type === "view") {
        viewVisitorIds.add(event.visitorId)
      }
      if (event.type === "deck_complete") {
        completionVisitorIds.add(event.visitorId)
      }
      if (event.type === "session_end" && typeof event.durationMs === "number") {
        durations.push(event.durationMs)
      }
      if (event.type === "slide_view" && event.slideId) {
        slideViews[event.slideId] = (slideViews[event.slideId] ?? 0) + 1
      }
      if (event.type === "poll_vote" && event.value) {
        pollVotes[event.value] = (pollVotes[event.value] ?? 0) + 1
      }
      if (!event.versionId) {
        continue
      }

      const metrics = variantMetrics.get(event.versionId) ?? {
        views: 0,
        uniqueVisitors: 0,
        completions: 0,
        ctaClicks: 0,
        leads: 0,
        pollVotes: 0,
        avgTimeSeconds: 0,
      }

      if (event.type === "view") {
        metrics.views += 1
        const ids = variantVisitorIds.get(event.versionId) ?? new Set<string>()
        ids.add(event.visitorId)
        variantVisitorIds.set(event.versionId, ids)
      }
      if (event.type === "cta_click") {
        metrics.ctaClicks += 1
      }
      if (event.type === "poll_vote") {
        metrics.pollVotes += 1
      }
      if (event.type === "deck_complete") {
        const ids = variantCompletionIds.get(event.versionId) ?? new Set<string>()
        ids.add(event.visitorId)
        variantCompletionIds.set(event.versionId, ids)
      }
      if (event.type === "session_end" && typeof event.durationMs === "number") {
        const values = variantDurations.get(event.versionId) ?? []
        values.push(event.durationMs)
        variantDurations.set(event.versionId, values)
      }

      variantMetrics.set(event.versionId, metrics)
    }

    for (const lead of leads) {
      if (!lead.versionId) {
        continue
      }

      const metrics = variantMetrics.get(lead.versionId) ?? {
        views: 0,
        uniqueVisitors: 0,
        completions: 0,
        ctaClicks: 0,
        leads: 0,
        pollVotes: 0,
        avgTimeSeconds: 0,
      }
      metrics.leads += 1
      variantMetrics.set(lead.versionId, metrics)
    }

    deck.analytics = {
      views: events.filter((event) => event.type === "view").length,
      uniqueVisitors: viewVisitorIds.size,
      completionRate: viewVisitorIds.size ? Math.round((completionVisitorIds.size / viewVisitorIds.size) * 100) : 0,
      avgTimeSeconds: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 1000) : 0,
      ctaClicks: events.filter((event) => event.type === "cta_click").length,
      leads: leads.length,
      slideViews,
      pollVotes,
      variantMetrics: Object.fromEntries(
        Array.from(variantMetrics.entries()).map(([versionId, metrics]) => [
          versionId,
          {
            ...metrics,
            uniqueVisitors: variantVisitorIds.get(versionId)?.size ?? 0,
            completions: variantCompletionIds.get(versionId)?.size ?? 0,
            avgTimeSeconds: (() => {
              const values = variantDurations.get(versionId) ?? []
              return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 1000) : 0
            })(),
          },
        ]),
      ),
    }
  }

  return {
    getUserByEmail(email: string) {
      return state.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null
    },

    getSessionByTokenHash(tokenHash: string) {
      return state.sessions.find((session) => session.tokenHash === tokenHash) ?? null
    },

    createUser(input: {
      name: string
      email: string
      passwordHash: string
      teamName: string
    }) {
      const now = Date.now()
      const teamId = nanoid(12)
      const workspaceId = nanoid(12)
      const user: UserRecord = {
        id: nanoid(12),
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        teamId,
        workspaceId,
        role: "admin",
        createdAt: now,
      }

      const team: TeamRecord = {
        id: teamId,
        slug: slugify(input.teamName),
        name: input.teamName,
        brand: {
          companyName: input.teamName,
          tagline: "Presentation infrastructure for modern teams.",
          voice: "Clear, premium, product-minded.",
          descriptors: ["editorial", "confident"],
          palette: [themeLibrary[0].accent, themeLibrary[1].accent],
          logos: ["wordmark"],
        },
        workspaces: [],
        members: [
          {
            userId: user.id,
            name: user.name,
            email: user.email,
            role: "admin",
          },
        ],
        invites: [],
      }

      const workspace = {
        id: workspaceId,
        teamId,
        slug: "hq",
        name: "HQ",
        description: "Default workspace",
        decks: [],
      }

      state.users.push(user)
      state.teams.push(team)
      state.workspaces.push(workspace)
      team.workspaces = [workspace]

      return cloneState(user)
    },

    createSession(session: SessionRecord) {
      state.sessions.push(session)
      return cloneState(session)
    },

    deleteSession(tokenHash: string) {
      state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash)
    },

    getSessionUser(tokenHash: string) {
      const session = this.getSessionByTokenHash(tokenHash)
      if (!session || session.expiresAt < Date.now()) {
        return null
      }

      const user = findUserById(session.userId)
      return user ? toSessionUser(user) : null
    },

    getDashboard(userId: string): DashboardData | null {
      const user = findUserById(userId)
      if (!user) {
        return null
      }

      const team = findTeam(user.teamId)
      const workspace = findWorkspace(user.workspaceId)

      if (!team || !workspace) {
        return null
      }

      return cloneState({
        sessionUser: toSessionUser(user),
        team: withTeamWorkspaces(team),
        workspace,
        decks: state.decks.filter((deck) => deck.workspaceId === workspace.id),
      })
    },

    getWorkspaceBySlug(userId: string, workspaceSlug: string) {
      const user = findUserById(userId)
      if (!user) {
        return null
      }

      const workspace = state.workspaces.find(
        (item) => item.teamId === user.teamId && item.slug === workspaceSlug,
      )

      if (!workspace) {
        return null
      }

      const team = findTeam(user.teamId)
      if (!team) {
        return null
      }

      return cloneState({
        sessionUser: toSessionUser(user),
        team: withTeamWorkspaces(team),
        workspace,
        decks: state.decks.filter((deck) => deck.workspaceId === workspace.id),
      })
    },

    getDeckEditor(userId: string, deckId: string) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      const team = user ? findTeam(user.teamId) : null
      const workspace = deck ? findWorkspace(deck.workspaceId) : null

      if (!user || !deck || !team || !workspace || deck.teamId !== team.id) {
        return null
      }

      return cloneState({
        sessionUser: toSessionUser(user),
        team: withTeamWorkspaces(team),
        workspace,
        deck,
      })
    },

    createWorkspace(userId: string, input: { name: string; description: string; slug: string }) {
      const user = findUserById(userId)
      if (!user) {
        throw new Error("Unable to create workspace")
      }

      const workspace = {
        id: nanoid(12),
        teamId: user.teamId,
        slug: input.slug,
        name: input.name.trim(),
        description: input.description.trim() || "A new workspace for a focused deck stream.",
        decks: [],
      }

      state.workspaces.push(workspace)
      const team = findTeam(user.teamId)
      if (team) {
        team.workspaces = state.workspaces.filter((item) => item.teamId === team.id)
      }

      return cloneState(workspace)
    },

    createInvite(userId: string, input: {
      email: string
      invitedName: string
      role: TeamInviteRecord["role"]
      workspaceId: string
    }) {
      const user = findUserById(userId)
      const team = user ? findTeam(user.teamId) : null

      if (!user || !team) {
        throw new Error("Unable to create invite")
      }

      if (state.users.some((member) => member.email.toLowerCase() === input.email.toLowerCase())) {
        throw new Error("That email already has an account.")
      }

      const invite: TeamInviteRecord = {
        id: nanoid(12),
        teamId: team.id,
        workspaceId: input.workspaceId,
        email: input.email.trim().toLowerCase(),
        invitedName: input.invitedName.trim() || input.email.split("@")[0]!,
        role: input.role,
        token: nanoid(24),
        status: "pending",
        createdAt: Date.now(),
        invitedByUserId: userId,
      }

      state.invites.unshift(invite)
      team.invites = state.invites.filter((item) => item.teamId === team.id)
      return cloneState(invite)
    },

    getInviteByToken(token: string) {
      const invite = state.invites.find((item) => item.token === token)
      if (!invite) {
        return null
      }

      const team = findTeam(invite.teamId)
      const workspace = findWorkspace(invite.workspaceId)
      if (!team || !workspace) {
        return null
      }

      return cloneState({
        invite,
        team: withTeamWorkspaces(team),
        workspace,
      })
    },

    acceptInvite(input: {
      token: string
      name: string
      passwordHash: string
    }) {
      const invite = state.invites.find((item) => item.token === input.token)
      if (!invite || invite.status !== "pending") {
        throw new Error("Invite not found")
      }

      if (state.users.some((user) => user.email === invite.email)) {
        throw new Error("That email already has an account.")
      }

      const user: UserRecord = {
        id: nanoid(12),
        name: input.name.trim(),
        email: invite.email,
        passwordHash: input.passwordHash,
        teamId: invite.teamId,
        workspaceId: invite.workspaceId,
        role: invite.role,
        createdAt: Date.now(),
      }

      state.users.push(user)
      invite.status = "accepted"
      invite.acceptedAt = Date.now()

      const team = findTeam(invite.teamId)
      if (team) {
        team.members.push({
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        })
        team.invites = state.invites.filter((item) => item.teamId === team.id)
      }

      return cloneState(user)
    },

    updateTeamMemberRole(userId: string, targetUserId: string, role: TeamInviteRecord["role"]) {
      const actor = findUserById(userId)
      const target = findUserById(targetUserId)
      const team = actor ? findTeam(actor.teamId) : null

      if (!actor || !target || !team) {
        throw new Error("Unable to update role")
      }

      target.role = role
      team.members = team.members.map((member) =>
        member.userId === targetUserId
          ? {
              ...member,
              role,
            }
          : member,
      )

      return cloneState(role)
    },

    async createDeckFromGeneration(userId: string, workspaceId: string, input: GenerationInput, source: DeckRecord["source"]) {
      const user = findUserById(userId)
      const workspace = findWorkspace(workspaceId)
      const team = user ? findTeam(user.teamId) : null

      if (!user || !workspace || !team || workspace.teamId !== team.id) {
        throw new Error("Unable to create deck")
      }

      const now = Date.now()
      const initialCheckpoint = createCheckpoint(source, input.prompt || "Initial generation", "Initial generation")
      const publicId = nanoid(10)
      const version = await createVersionFromSource(publicId, source, "Version A", "preview")
      const persistedInputAssets = buildStoredInputAssets(await persistInputFiles(team.slug, publicId, input.files))

      const deck: DeckRecord = {
        id: nanoid(12),
        teamId: team.id,
        workspaceId,
        publicId,
        slug: slugify(source.title),
        title: source.title,
        description: source.summary,
        status: "preview",
        createdAt: now,
        updatedAt: now,
        createdBy: user.id,
        source,
        checkpoints: [initialCheckpoint],
        versions: [version],
        publishedVersionId: undefined,
        reviewRequests: [],
        analytics: createEmptyAnalytics(),
        assets: [...persistedInputAssets, ...buildInitialDeckAssets({ ...input, files: [] }, source)],
        themeMode: input.themeMode,
        passwordProtected: false,
      }

      state.decks.unshift(deck)
      refreshWorkspaceDecks(team, deck)
      return cloneState(deck)
    },

    saveCheckpoint(userId: string, deckId: string, source: DeckRecord["source"], prompt: string, title: string) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      if (!user || !deck || deck.teamId !== user.teamId) {
        throw new Error("Deck not found")
      }

      deck.source = source
      deck.title = source.title
      deck.description = source.summary
      deck.slug = slugify(source.title)
      deck.updatedAt = Date.now()
      deck.checkpoints.unshift(createCheckpoint(source, prompt, title))
      return cloneState(deck)
    },

    async publishVersion(userId: string, deckId: string, source: DeckRecord["source"], label: string, passwordHash?: string) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      if (!user || !deck || deck.teamId !== user.teamId) {
        throw new Error("Deck not found")
      }

      const version = await createVersionFromSource(deck.publicId, source, label)
      if (passwordHash) {
        version.passwordHash = passwordHash
      }
      deck.source = source
      deck.title = source.title
      deck.description = source.summary
      deck.slug = slugify(source.title)
      deck.updatedAt = Date.now()
      deck.status = "published"
      deck.passwordProtected = Boolean(passwordHash)
      deck.passwordHash = passwordHash
      deck.versions.unshift(version)
      deck.publishedVersionId = version.id
      return cloneState(version)
    },

    randomizeTheme(userId: string, deckId: string) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      if (!user || !deck || deck.teamId !== user.teamId) {
        throw new Error("Deck not found")
      }

      deck.source = {
        ...deck.source,
        theme: remixTheme(deck.source.theme, deck.source.brand),
      }
      deck.themeMode = "remix"
      deck.updatedAt = Date.now()
      return cloneState(deck.source)
    },

    restoreCheckpoint(userId: string, deckId: string, checkpointId: string) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      const checkpoint = deck?.checkpoints.find((item) => item.id === checkpointId)
      if (!user || !deck || deck.teamId !== user.teamId || !checkpoint) {
        throw new Error("Checkpoint not found")
      }

      deck.source = checkpoint.source
      deck.title = checkpoint.source.title
      deck.description = checkpoint.source.summary
      deck.slug = slugify(checkpoint.source.title)
      deck.updatedAt = Date.now()
      return cloneState(deck)
    },

    createReviewRequest(userId: string, deckId: string, versionId: string, title: string) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      if (!user || !deck || deck.teamId !== user.teamId) {
        throw new Error("Deck not found")
      }

      const review: ReviewRequest = {
        id: nanoid(10),
        token: nanoid(18),
        title,
        createdAt: Date.now(),
        status: "open",
        versionId,
        comments: [],
      }

      deck.reviewRequests.unshift(review)
      return cloneState(review)
    },

    addAsset(userId: string, deckId: string, asset: Omit<AssetRecord, "id">) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      if (!user || !deck || deck.teamId !== user.teamId) {
        throw new Error("Deck not found")
      }

      deck.assets.unshift({
        id: nanoid(8),
        ...asset,
      })
      deck.updatedAt = Date.now()
      return cloneState(deck)
    },

    saveExperiment(userId: string, deckId: string, experiment: Omit<DeckExperiment, "id"> | null) {
      const user = findUserById(userId)
      const deck = findDeck(deckId)
      if (!user || !deck || deck.teamId !== user.teamId) {
        throw new Error("Deck not found")
      }

      deck.experiment = experiment
        ? {
            id: deck.experiment?.id ?? nanoid(10),
            ...experiment,
          }
        : undefined
      deck.updatedAt = Date.now()
      return cloneState(deck)
    },

    addReviewComment(token: string, input: {
      authorName: string
      body: string
      slideId?: string
      status?: "comment" | "suggestion"
      suggestedPrompt?: string
      parentCommentId?: string
    }) {
      const deck = state.decks.find((item) => item.reviewRequests.some((review) => review.token === token))
      const review = deck?.reviewRequests.find((item) => item.token === token)

      if (!deck || !review) {
        throw new Error("Review link not found")
      }

      review.comments.unshift({
        id: nanoid(10),
        authorName: input.authorName,
        body: input.body,
        createdAt: Date.now(),
        slideId: input.slideId,
        status: input.status ?? "comment",
        suggestedPrompt: input.suggestedPrompt,
        parentCommentId: input.parentCommentId,
      })

      review.status = "changes_requested"
      return cloneState(review)
    },

    updateReviewStatus(token: string, status: ReviewRequest["status"]) {
      const deck = state.decks.find((item) => item.reviewRequests.some((review) => review.token === token))
      const review = deck?.reviewRequests.find((item) => item.token === token)

      if (!deck || !review) {
        throw new Error("Review link not found")
      }

      review.status = status
      deck.updatedAt = Date.now()
      return cloneState(review)
    },

    updateReviewComment(
      token: string,
      commentId: string,
      patch: Partial<Pick<ReviewRequest["comments"][number], "status" | "appliedAt">>,
    ) {
      const deck = state.decks.find((item) => item.reviewRequests.some((review) => review.token === token))
      const review = deck?.reviewRequests.find((item) => item.token === token)
      const comment = review?.comments.find((item) => item.id === commentId)

      if (!deck || !review || !comment) {
        throw new Error("Review comment not found")
      }

      Object.assign(comment, patch)
      deck.updatedAt = Date.now()
      return cloneState(comment)
    },

    getPublicDeck(teamSlug: string, deckSlug: string): PublicDeckView | null {
      const team = state.teams.find((item) => item.slug === teamSlug)
      if (!team) {
        return null
      }

      const deck = state.decks.find((item) => item.teamId === team.id && item.slug === deckSlug)
      if (!deck || deck.status !== "published" || !deck.publishedVersionId) {
        return null
      }

      const version = deck.versions.find((item) => item.id === deck.publishedVersionId) ?? null

      if (!version) {
        return null
      }

      return cloneState({
        team,
        deck,
        version,
      })
    },

    getPublicDeckById(publicId: string): PublicDeckView | null {
      const deck = state.decks.find((item) => item.publicId === publicId)
      if (!deck || deck.status !== "published" || !deck.publishedVersionId) {
        return null
      }

      const team = findTeam(deck.teamId)
      const version = deck.versions.find((item) => item.id === deck.publishedVersionId) ?? null

      if (!team || !version) {
        return null
      }

      return cloneState({
        team,
        deck,
        version,
      })
    },

    getReviewView(token: string): ReviewView | null {
      const deck = state.decks.find((item) => item.reviewRequests.some((review) => review.token === token))
      if (!deck) {
        return null
      }

      const review = deck.reviewRequests.find((item) => item.token === token)
      const team = findTeam(deck.teamId)
      const version = deck.versions.find((item) => item.id === review?.versionId)

      if (!review || !team || !version) {
        return null
      }

      return cloneState({
        team: withTeamWorkspaces(team),
        deck,
        review,
        version,
      })
    },

    verifyDeckPassword(publicId: string, passwordHash?: string, password?: string) {
      const deck = state.decks.find((item) => item.publicId === publicId)
      if (!deck) {
        return false
      }

      if (!deck.passwordProtected || !deck.passwordHash) {
        return true
      }

      return deck.passwordHash === passwordHash && Boolean(password)
    },

    recordEvent(event: AnalyticsEvent) {
      const deck = event.deckId
        ? findDeck(event.deckId)
        : state.decks.find((item) => item.publicId === event.publicId)
      const nextEvent = {
        ...event,
        deckId: deck?.id,
      }
      state.events.push(nextEvent)
      if (deck) {
        accumulateAnalytics(deck.id)
      }
      return cloneState(nextEvent)
    },

    captureLead(lead: LeadRecord) {
      const deck = lead.deckId
        ? findDeck(lead.deckId)
        : state.decks.find((item) => item.publicId === lead.publicId)
      const nextLead = {
        ...lead,
        deckId: deck?.id,
      }
      state.leads.push(nextLead)
      if (deck) {
        accumulateAnalytics(deck.id)
      }
      return cloneState(nextLead)
    },

    snapshot(): RepositoryState {
      return cloneState(state)
    },
  }
}

