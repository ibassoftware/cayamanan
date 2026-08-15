import Link from "next/link"
import { redirect } from "next/navigation"
import { Users, Wallet, Settings } from "lucide-react"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getServerSession } from "@/lib/session"
import type { Role } from "@/platform/actions"

const MODULES = [
  {
    label: "Employees",
    href: "/app/employees",
    icon: Users,
    description: "Organization, positions and employee master data.",
    roles: ["ADMIN", "HR_PAYROLL"] as const,
  },
  {
    label: "Payroll",
    href: "/app/payroll",
    icon: Wallet,
    description: "Cutoffs, statutory deductions and payslips.",
    roles: ["ADMIN", "HR_PAYROLL"] as const,
  },
  {
    label: "Settings",
    href: "/app/settings/system",
    icon: Settings,
    description: "Tenant and company-level system configuration.",
    roles: ["ADMIN"] as const,
  },
] as const

export default async function AppHomePage() {
  const session = await getServerSession()
  // Should not happen — the layout above already redirects an unauthenticated visit —
  // but fail safe rather than rendering with an empty role list.
  const roles: Role[] = session?.roles ?? []

  // Employee's only nav entries are under /app/me/* (acceptance criterion 1); send them
  // straight to their one screen rather than a home page with nothing they can open.
  if (!roles.includes("ADMIN") && !roles.includes("HR_PAYROLL")) {
    redirect("/app/me/security")
  }

  const visibleModules = MODULES.filter(module => module.roles.some(role => roles.includes(role)))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="tc-app-title mb-2">Welcome to Cayamanan</h1>
        <p className="tc-measure text-body-subtle">
          This is the application shell. Module screens are built out slice
          by slice — pick a module below once its slice has landed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleModules.map(module => {
          const Icon = module.icon

          return (
            <Card key={module.href}>
              <CardHeader>
                <Icon
                  className="mb-2 size-5 text-brand-strong"
                  aria-hidden="true"
                />
                <CardTitle>{module.label}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                {/* Renders an <a>, not a <button>, so Base UI must not apply
                    native button semantics (see NativeButtonProps). */}
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={module.href} />}
                >
                  Open
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
