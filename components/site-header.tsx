import Link from "next/link"

import { signOutAction } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import type { SessionUser } from "@/lib/types"

export function SiteHeader({ sessionUser }: { sessionUser: SessionUser | null }) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/" className="text-sm font-semibold tracking-tight text-[#171a17]">
        Intelligent Visualization
      </Link>

      {sessionUser ? (
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-muted-foreground sm:inline">{sessionUser.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button nativeButton={false} render={<Link href="/auth?returnTo=/app" />} variant="ghost" size="sm">
            Sign in
          </Button>
          <Button nativeButton={false} render={<Link href="/auth?mode=signup&returnTo=/app" />} size="sm">
            Sign up
          </Button>
        </div>
      )}
    </header>
  )
}
