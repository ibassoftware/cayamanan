"use client"

// Presentational loading/empty/error/no-permission panels, factored out of the
// hand-rolled versions in system-settings-screen.tsx and users-screen.tsx so every
// model screen (list, detail, or form) renders these four required states the same
// way instead of copy-pasting the Card markup. Domain-agnostic: screens supply their
// own copy and icon.

import type { ComponentType } from "react"
import { AlertTriangle, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface PanelProps {
  className?: string
}

export function LoadingPanel({ className, label }: PanelProps & { label: string }) {
  return (
    <Card className={className ?? "max-w-xl"}>
      <CardContent className="flex items-center gap-3 py-2 text-body-subtle">
        <Spinner />
        <span>{label}</span>
      </CardContent>
    </Card>
  )
}

export function NoPermissionPanel({
  className,
  title = "You don’t have permission to view this",
  description,
}: PanelProps & { title?: string; description: string }) {
  return (
    <Card className={className ?? "max-w-xl"}>
      <CardHeader>
        <div className="mb-1">
          <Lock className="size-5 text-body-subtle" aria-hidden="true" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

export function ErrorPanel({
  className,
  title,
  message,
  onRetry,
}: PanelProps & { title: string; message: string; onRetry?: () => void }) {
  return (
    <Card className={className ?? "max-w-xl"}>
      <CardHeader>
        <div className="mb-1">
          <AlertTriangle className="size-5 text-fg-danger" aria-hidden="true" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </CardContent>
      )}
    </Card>
  )
}

export interface EmptyPanelAction {
  label: string
  onClick: () => void
}

export function EmptyPanel({
  className,
  icon: Icon,
  title,
  description,
  action,
}: PanelProps & {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
  title: string
  description: string
  action?: EmptyPanelAction
}) {
  return (
    <Card className={className ?? "max-w-xl"}>
      <CardHeader>
        {Icon && (
          <div className="mb-1">
            <Icon className="size-5 text-body-subtle" aria-hidden="true" />
          </div>
        )}
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action && (
        <CardContent>
          <Button onClick={action.onClick}>{action.label}</Button>
        </CardContent>
      )}
    </Card>
  )
}
