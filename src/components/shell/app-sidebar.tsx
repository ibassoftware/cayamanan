"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Users, Wallet, Settings, ShieldCheck, Building2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Role } from "@/platform/actions"
import { getVisibleNavItems, type NavItem } from "@/components/shell/nav-items"

const ICONS: Record<NavItem["icon"], typeof Home> = {
  home: Home,
  users: Users,
  wallet: Wallet,
  settings: Settings,
  shield: ShieldCheck,
  building: Building2,
}

function isNavItemActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon]

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg border-l-2 border-transparent px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "border-l-brand-strong bg-brand-softer font-medium text-brand-strong"
          : "text-body hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  )
}

export function AppSidebar({ roles }: { roles: readonly Role[] }) {
  const pathname = usePathname()
  const items = getVisibleNavItems(roles)

  return (
    <aside className="shrink-0 border-border border-b bg-card lg:w-60 lg:border-r lg:border-b-0">
      <div className="hidden px-4 py-4 lg:block">
        <Link href="/app" className="font-heading text-heading text-lg">
          Cayamanan
        </Link>
      </div>

      <nav aria-label="Main" className="p-3 lg:px-3 lg:pt-0 lg:pb-4">
        <ul className="flex flex-row flex-wrap gap-1 lg:flex-col">
          {items.map(item => (
            <li key={item.href}>
              <NavLink item={item} active={isNavItemActive(pathname, item.href)} />
              {item.children && item.children.length > 0 && (
                <ul className="mt-0.5 flex flex-row flex-wrap gap-1 pl-3 lg:flex-col">
                  {item.children.map(child => (
                    <li key={child.href}>
                      <NavLink item={child} active={isNavItemActive(pathname, child.href)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
