import { redirect } from "next/navigation"

import { requireSessionUser } from "@/lib/server-auth"

export default async function AppPage() {
  const sessionUser = await requireSessionUser()
  redirect(`/app/workspaces/${sessionUser.workspaceSlug}`)
}
