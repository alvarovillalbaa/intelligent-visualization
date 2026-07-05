import { SiteHeader } from "@/components/site-header"
import { requireSessionUser } from "@/lib/server-auth"

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const sessionUser = await requireSessionUser()

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-[#171a17]">
      <SiteHeader sessionUser={sessionUser} />
      <div className="min-w-0 px-5 pb-20 pt-4 sm:px-8 lg:px-10">{children}</div>
    </div>
  )
}
