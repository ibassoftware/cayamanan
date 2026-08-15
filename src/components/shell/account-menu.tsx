"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { callAction } from "@/lib/actions-client"

interface MeOutput {
  userId: string
  email: string
  name: string
}

export function AccountMenu() {
  const router = useRouter()
  const [me, setMe] = useState<MeOutput | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await callAction<MeOutput>("identity.me")
      if (!cancelled && result.ok) setMe(result.data)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    // Best-effort: navigate to /login regardless of the call's outcome — an already
    // -expired session still needs the same result for the person using it.
    await callAction("identity.logout")
    router.push("/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm">
            <User aria-hidden="true" />
            <span className="max-w-40 truncate">{me?.name ?? "Account"}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {me && (
          <>
            <DropdownMenuLabel>
              <span className="block truncate font-normal text-body-subtle">{me.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled={loggingOut} onClick={handleLogout}>
          <LogOut aria-hidden="true" />
          {loggingOut ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
