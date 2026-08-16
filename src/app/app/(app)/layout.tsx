import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/shell/app-sidebar"
import { Breadcrumbs } from "@/components/shell/breadcrumbs"
import { ChatSlot } from "@/components/shell/chat-slot"
import { AccountMenu } from "@/components/shell/account-menu"
import { MissyPageBadge } from "@/components/missy/missy-page-badge"
import { getServerSession } from "@/lib/session"
import { ScreenContextProvider } from "@/lib/screen-context"
import { ChatProvider } from "@/components/chat/chat-provider"

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  // Server-side gate: every /app/** route requires a valid session. This is the real
  // enforcement for "unauthenticated visits redirect to /login" — the sidebar's
  // role-based item filtering below is a usability affordance only, never the boundary.
  const session = await getServerSession()
  if (!session) {
    redirect("/login")
  }

  return (
    // Both providers are mounted here — above `{children}`, not inside any one page — so
    // Missy's conversation state survives client-side navigation between /app/* screens
    // (03-missy-foundation.md criterion 1). This layout instance is reused across
    // navigations within the (app) route group; only `children` swaps.
    <ScreenContextProvider>
      <ChatProvider>
        {/* Desktop pins the shell to the viewport so each column scrolls independently —
            with `min-h-dvh` alone a long Missy conversation grew the whole page, pushing
            the nav and the composer off-screen. Mobile keeps normal page scrolling (the
            chat is a floating overlay there, not a column). */}
        <div className="flex min-h-dvh w-full flex-col bg-background lg:h-dvh lg:min-h-0 lg:flex-row lg:overflow-hidden">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Skip to main content
          </a>

          <AppSidebar roles={session.roles} />

          <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
            <header className="flex shrink-0 items-center justify-between gap-4 border-border border-b bg-card px-4 py-3 sm:px-6">
              <Breadcrumbs />
              <div className="flex items-center gap-3">
                <MissyPageBadge />
                <AccountMenu />
              </div>
            </header>

            <main
              id="main-content"
              className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:py-8"
            >
              {children}
            </main>
          </div>

          <ChatSlot />
        </div>
      </ChatProvider>
    </ScreenContextProvider>
  )
}
