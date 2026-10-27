import { redirect } from "next/navigation"

import { SiteHeader } from "@/components/site-header"
import { Composer } from "@/components/visualizations/composer"
import { getCurrentSessionUser } from "@/lib/server-auth"

export default async function Home() {
  const sessionUser = await getCurrentSessionUser()

  if (sessionUser) {
    redirect("/app")
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#171a17]">
      <SiteHeader sessionUser={null} />
      <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
        <Composer mode="guest" introduction={
          <header className="mb-6 max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Start with your source material.
            </h1>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Paste text, drop files, or point at a page. Then choose what to make of it.
            </p>
          </header>
        } />
      </div>
    </main>
  )
}
