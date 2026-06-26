import Link from "next/link"
import { notFound } from "next/navigation"

import { createWorkspaceAction, updateTeamMemberRoleAction } from "@/app/actions/decks"
import { CreateDeckFlow } from "@/components/slides/create-deck-flow"
import { TeamInviteForm } from "@/components/slides/team-invite-form"
import { Button } from "@/components/ui/button"
import { repository } from "@/lib/repository"
import { requireSessionUser } from "@/lib/server-auth"
import type { DeckRecord } from "@/lib/types"
import { formatRelativeDate } from "@/lib/utils"

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  const sessionUser = await requireSessionUser()
  const dashboard = await repository.getWorkspaceBySlug(sessionUser.id, workspaceSlug)

  if (!dashboard) {
    notFound()
  }

  const canManageWorkspaces = sessionUser.role === "admin"

  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{dashboard.workspace.name}</h1>
        <p className="mt-3 text-lg leading-8 text-muted-foreground">{dashboard.workspace.description}</p>
      </header>

      <CreateDeckFlow workspaceId={dashboard.workspace.id} workspaceSlug={dashboard.workspace.slug} />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Visualizations</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Existing work</h2>
          </div>
          <p className="text-sm text-muted-foreground">{dashboard.decks.length} total</p>
        </div>

        <div className="grid gap-2">
          {dashboard.decks.length ? (
            dashboard.decks.map((deck) => (
              <VisualizationRow
                key={deck.id}
                deck={deck}
                teamSlug={dashboard.team.slug}
                workspaceSlug={dashboard.workspace.slug}
              />
            ))
          ) : (
            <p className="rounded-lg bg-white px-4 py-5 text-sm text-muted-foreground shadow-sm">
              No visualizations in this workspace yet.
            </p>
          )}
        </div>
      </section>

      {canManageWorkspaces ? (
        <details className="group rounded-lg bg-white p-5 shadow-sm">
          <summary className="cursor-pointer list-none text-sm font-medium">
            Workspace settings
          </summary>
          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <div className="grid gap-4">
              <TeamInviteForm workspaceId={dashboard.workspace.id} />
              {dashboard.team.invites.length ? (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">Outstanding invites</p>
                  {dashboard.team.invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{invite.email}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          {invite.role} / {invite.status}
                        </p>
                      </div>
                      <Link href={`/join/${invite.token}`} className="text-sm font-medium text-primary underline">
                        Open invite
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4">
              <form action={createWorkspaceAction} className="grid gap-3">
                <p className="text-sm font-medium">Create workspace</p>
                <input
                  name="name"
                  placeholder="Launch campaigns"
                  className="h-11 rounded-md bg-muted/35 px-4 text-sm outline-none"
                />
                <textarea
                  name="description"
                  placeholder="Visualizations for a focused stream of work."
                  className="min-h-24 rounded-md bg-muted/35 px-4 py-3 text-sm outline-none"
                />
                <Button type="submit">Create workspace</Button>
              </form>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Team roles</p>
                {dashboard.team.members.map((member) => (
                  <div key={member.userId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{member.email}</p>
                    </div>
                    {member.userId !== sessionUser.id ? (
                      <form action={updateTeamMemberRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="targetUserId" value={member.userId} />
                        <select
                          name="role"
                          defaultValue={member.role}
                          className="h-9 rounded-md bg-white px-3 text-xs uppercase tracking-[0.14em] text-muted-foreground outline-none"
                        >
                          <option value="admin">admin</option>
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        <Button type="submit" variant="outline" size="sm">
                          Save
                        </Button>
                      </form>
                    ) : (
                      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{member.role}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  )
}

function VisualizationRow({
  deck,
  teamSlug,
  workspaceSlug,
}: {
  deck: DeckRecord
  teamSlug: string
  workspaceSlug: string
}) {
  const unresolvedComments = deck.reviewRequests.reduce(
    (sum, review) => sum + review.comments.filter((comment) => comment.status !== "resolved").length,
    0,
  )

  return (
    <article className="grid gap-4 rounded-lg bg-white px-4 py-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-semibold">{deck.title}</h3>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {deck.status}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{deck.description}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Updated {formatRelativeDate(deck.updatedAt)}</span>
          <span>{deck.versions.length} versions</span>
          <span>{deck.analytics.views} views</span>
          <span>{unresolvedComments} open review</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/app/workspaces/${workspaceSlug}/decks/${deck.id}`}
          className="inline-flex h-9 items-center rounded-md bg-[#111513] px-3 text-sm font-medium text-white transition-colors hover:bg-[#202820]"
        >
          Open
        </Link>
        <Link
          href={`/d/${teamSlug}/${deck.slug}`}
          className="inline-flex h-9 items-center rounded-md bg-muted px-3 text-sm font-medium transition-colors hover:bg-muted/70"
        >
          Public
        </Link>
      </div>
    </article>
  )
}
