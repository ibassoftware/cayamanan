import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/shell/app-sidebar"
import { Breadcrumbs } from "@/components/shell/breadcrumbs"
import { ChatSlot } from "@/components/shell/chat-slot"
import { AccountMenu } from "@/components/shell/account-menu"
import { getServerSession } from "@/lib/session"

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  // Server-side gate: every /app/** route requires a valid session. This is the real
  // enforcement for "unauthenticated visits redirect to /login" — the sidebar's
  // role-based item filtering below is a usability affordance only, never the boundary.
  const session = await getServerSession()
  if (!session) {
    redirect("/login")
  }

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <AppSidebar roles={session.roles} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-border border-b bg-card px-4 py-3 sm:px-6">
          <Breadcrumbs />
          <AccountMenu />
        </header>

        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8"
        >
          {children}
        </main>
      </div>

      <ChatSlot />
    </div>
  )
}
