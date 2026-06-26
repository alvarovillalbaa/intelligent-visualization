import Link from "next/link"
import { ChevronDownIcon, LayersIcon, LogOutIcon, PanelsTopLeftIcon } from "lucide-react"

import { signOutAction } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { repository } from "@/lib/repository"
import { requireSessionUser } from "@/lib/server-auth"
import { cn } from "@/lib/utils"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const sessionUser = await requireSessionUser()
  const dashboard = await repository.getDashboard(sessionUser.id)
  const workspaces = dashboard?.team.workspaces ?? []
  const visualizations = workspaces.flatMap((workspace) =>
    workspace.decks.map((deck) => ({
      ...deck,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
    })),
  )

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-[#171a17]">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-screen flex-col bg-[#111513] px-4 py-5 text-white">
          <div className="flex items-center gap-3 px-2">
            <div className="grid size-10 place-items-center rounded-full bg-white text-sm font-semibold text-[#111513]">
              IV
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{sessionUser.teamName}</p>
              <p className="truncate text-xs text-white/52">{sessionUser.email}</p>
            </div>
          </div>

          <nav className="mt-8 grid gap-5">
            <SidebarSection
              title="Workspaces"
              icon={<PanelsTopLeftIcon className="size-4" />}
              count={workspaces.length}
            >
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  href={`/app/workspaces/${workspace.slug}`}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    workspace.slug === sessionUser.workspaceSlug
                      ? "bg-white text-[#111513]"
                      : "text-white/72 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{workspace.name}</span>
                    <span className="text-xs opacity-60">{workspace.decks.length}</span>
                  </span>
                </Link>
              ))}
            </SidebarSection>

            <SidebarSection
              title="Visualizations"
              icon={<LayersIcon className="size-4" />}
              count={visualizations.length}
            >
              {visualizations.length ? (
                visualizations.map((visualization) => (
                  <Link
                    key={visualization.id}
                    href={`/app/workspaces/${visualization.workspaceSlug}/decks/${visualization.id}`}
                    className="block rounded-md px-3 py-2 text-sm text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    <span className="block truncate font-medium">{visualization.title}</span>
                    <span className="mt-1 block truncate text-xs text-white/44">{visualization.workspaceName}</span>
                  </Link>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-white/48">No visualizations yet.</p>
              )}
            </SidebarSection>
          </nav>

          <form action={signOutAction} className="mt-auto pt-6">
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-2 text-white/72 hover:bg-white/8 hover:text-white"
            >
              <LogOutIcon className="size-4" />
              Sign out
            </Button>
          </form>
        </aside>

        <div className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">{children}</div>
      </div>
    </div>
  )
}

function SidebarSection({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-white/86 transition-colors hover:bg-white/8">
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs text-white/46">
          {count}
          <ChevronDownIcon className="size-4" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 grid gap-1">{children}</CollapsibleContent>
    </Collapsible>
  )
}
