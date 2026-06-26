import { redirect } from "next/navigation"

import { AuthForms } from "@/components/slides/auth-forms"
import { getCurrentSessionUser } from "@/lib/server-auth"

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; returnTo?: string }>
}) {
  const { mode, returnTo } = await searchParams
  const sessionUser = await getCurrentSessionUser()

  if (sessionUser) {
    redirect("/app")
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid gap-8">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Account</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
              Keep your visualization workspace.
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Save imported sources, drafts, published versions, and review loops beyond this browser session.
            </p>
          </div>
          <AuthForms defaultMode={mode === "signup" ? "signup" : "signin"} returnTo={returnTo} />
        </div>
      </div>
    </main>
  )
}
