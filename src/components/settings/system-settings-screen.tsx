"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Lock, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { callAction } from "@/lib/actions-client"
import { SettingForm } from "@/components/settings/setting-form"
import { OpenAiKeyCard } from "@/components/settings/openai-key-card"
import {
  deriveSettingsScreenState,
  formatSettingValue,
  type SystemSetting,
} from "@/components/settings/settings-state"
import type { ActionResult } from "@/platform/errors"

interface GetSettingsOutput {
  settings: SystemSetting[]
}

type DialogState = { mode: "create" } | { mode: "edit"; setting: SystemSetting } | null

export function SystemSettingsScreen() {
  const [result, setResult] = useState<ActionResult<GetSettingsOutput> | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)

  const fetchSettings = useCallback(async () => {
    const response = await callAction<GetSettingsOutput>("system.getSettings")
    setResult(response)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const response = await callAction<GetSettingsOutput>("system.getSettings")
      if (!cancelled) setResult(response)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const state = deriveSettingsScreenState(result)

  function handleSaved(setting: SystemSetting) {
    setDialogState(null)
    // Reflect the save immediately, then reconcile with the server so a reopened
    // screen and this one agree (acceptance criterion #3).
    setResult(current =>
      current && current.ok
        ? {
            ok: true,
            data: {
              settings: [
                ...current.data.settings.filter(s => s.key !== setting.key),
                setting,
              ].sort((a, b) => a.key.localeCompare(b.key)),
            },
          }
        : current,
    )
    fetchSettings()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">System settings</h1>
        {state.status === "ready" && state.settings.length > 0 && (
          <Button onClick={() => setDialogState({ mode: "create" })}>Add setting</Button>
        )}
      </div>

      <OpenAiKeyCard />

      {state.status === "loading" && (
        <Card className="max-w-xl">
          <CardContent className="flex items-center gap-3 py-2 text-body-subtle">
            <Spinner />
            <span>Loading system settings…</span>
          </CardContent>
        </Card>
      )}

      {state.status === "no-permission" && (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <Lock className="size-5 text-body-subtle" aria-hidden="true" />
            </div>
            <CardTitle>You don&rsquo;t have permission to view this</CardTitle>
            <CardDescription>
              System settings are restricted to Admins. Ask an administrator if you
              need a setting changed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {state.status === "error" && (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <AlertTriangle className="size-5 text-fg-danger" aria-hidden="true" />
            </div>
            <CardTitle>Couldn&rsquo;t load system settings</CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => fetchSettings()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {state.status === "ready" && state.settings.length === 0 && (
        <Card className="max-w-xl">
          <CardHeader>
            <div className="mb-1">
              <Settings2 className="size-5 text-body-subtle" aria-hidden="true" />
            </div>
            <CardTitle>No settings yet</CardTitle>
            <CardDescription>
              Nothing has been configured for this company yet. Add the first
              system setting to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setDialogState({ mode: "create" })}>Add setting</Button>
          </CardContent>
        </Card>
      )}

      {state.status === "ready" && state.settings.length > 0 && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border border-b bg-muted text-left">
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Key
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Value
                </th>
                <th scope="col" className="px-4 py-2 font-medium text-heading">
                  Effective from
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-heading">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.settings.map(setting => (
                <tr key={setting.key} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium text-heading">{setting.key}</td>
                  <td className="px-4 py-2 text-body-subtle">
                    <code className="[font-variant-numeric:tabular-nums]">
                      {formatSettingValue(setting.value)}
                    </code>
                  </td>
                  <td className="px-4 py-2 text-body-subtle">{setting.effectiveFrom}</td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialogState({ mode: "edit", setting })}
                    >
                      Edit
                      <span className="sr-only"> {setting.key}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialogState !== null}
        onOpenChange={open => {
          if (!open) setDialogState(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === "edit" ? "Edit setting" : "Add setting"}
            </DialogTitle>
            <DialogDescription>
              Saving closes out the previous version (if any) and records an
              audited change.
            </DialogDescription>
          </DialogHeader>
          {dialogState && (
            <SettingForm
              editingSetting={dialogState.mode === "edit" ? dialogState.setting : null}
              onSaved={handleSaved}
              onCancel={() => setDialogState(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
