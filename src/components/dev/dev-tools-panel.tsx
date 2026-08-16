"use client"

// Dev-only "tools available to me" panel (docs/plan/03-missy-foundation.md). Renders the
// data `build-view.ts` already computed server-side from the viewer's own verified
// session — this component only ever picks which of those precomputed views to display,
// never fetches or re-derives anything, so it can't accidentally show a tool the current
// role isn't allowed.
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { DataTable, type DataTableColumn } from "@/components/data/data-table"
import type { ListScreenState } from "@/components/data/list-state"
import { EmptyPanel } from "@/components/data/state-panels"

import type { DevToolEntry, DevToolsData, DevToolsView } from "@/app/dev/tools/build-view"

function RiskBadges({ tool }: { tool: DevToolEntry }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={tool.risk === "high" ? "warning" : "secondary"}>
        {tool.risk === "high" ? "High risk" : "Ordinary"}
      </Badge>
      {tool.requiresConfirmation && <Badge variant="destructive">Confirmation required</Badge>}
      <Badge variant="outline">{tool.read ? "Read" : "Write"}</Badge>
      <Badge variant="outline">{tool.scope === "self" ? "Self scope" : "Company scope"}</Badge>
    </div>
  )
}

function FieldsList({ tool }: { tool: DevToolEntry }) {
  if (tool.fields.length === 0) {
    return <p className="text-body-subtle text-xs italic">No input parameters.</p>
  }
  return (
    <dl className="flex flex-col gap-1">
      {tool.fields.map(field => (
        <div key={field.name} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
          <dt className="font-mono font-medium text-heading">{field.name}</dt>
          <dd className="text-body-subtle">{field.type}</dd>
          {field.required && <Badge variant="outline">required</Badge>}
          {field.description && <dd className="text-body-subtle italic">— {field.description}</dd>}
        </div>
      ))}
    </dl>
  )
}

function ModuleToolsTable({ module, tools }: { module: string; tools: DevToolEntry[] }) {
  const state: ListScreenState<DevToolEntry> = { status: "ready", items: tools }

  const columns: DataTableColumn<DevToolEntry>[] = [
    {
      id: "tool",
      header: "Tool",
      cell: row => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs text-heading">{row.id}</span>
          <span className="text-body-subtle text-xs">{row.title}</span>
        </div>
      ),
    },
    { id: "attributes", header: "Attributes", cell: row => <RiskBadges tool={row} /> },
    { id: "description", header: "Description", cell: row => <span className="text-xs">{row.description}</span> },
    { id: "fields", header: "Parameters", cell: row => <FieldsList tool={row} /> },
  ]

  return (
    <DataTable
      aria-label={`${module} tools`}
      state={state}
      columns={columns}
      getRowId={row => row.id}
      emptyState={{ title: "No tools", description: "This module has no tools in the current view." }}
      noPermission={{ description: "Not applicable here — every row already passed the role filter." }}
    />
  )
}

function ViewDetail({ view }: { view: DevToolsView }) {
  if (view.modules.length === 0) {
    return (
      <EmptyPanel
        title="No tools in this view"
        description="The current role plus this scope resolves to zero tools. Check the role or pick a different screen to simulate."
      />
    )
  }

  return (
    <Accordion defaultValue={view.modules.map(group => group.module)} className="gap-3">
      {view.modules.map(group => (
        <AccordionItem key={group.module} value={group.module} className="rounded-lg border border-border px-3">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <span className="font-medium text-heading capitalize">{group.module}</span>
              <Badge variant="brand">{group.tools.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-3">
            <ModuleToolsTable module={group.module} tools={group.tools} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function StatCard({
  title,
  view,
  emphasis,
}: {
  title: string
  view: DevToolsView
  emphasis?: boolean
}) {
  return (
    <Card className={emphasis ? "border-[var(--tc-brand-soft)]" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{view.label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-2xl font-semibold text-heading [font-variant-numeric:tabular-nums]">
          {view.toolCount} <span className="text-sm font-normal text-body-subtle">tools</span>
        </p>
        <p className="text-body-subtle text-sm [font-variant-numeric:tabular-nums]">
          {view.payloadChars.toLocaleString()} chars of schema payload
        </p>
      </CardContent>
    </Card>
  )
}

export function DevToolsPanel({ data }: { data: DevToolsData }) {
  const [selectedModule, setSelectedModule] = useState(data.moduleOptions[0]?.value ?? "")
  const [tab, setTab] = useState<"unscoped" | "scoped">("scoped")

  const scopedView = data.scopedByModule[selectedModule]

  if (!scopedView) {
    return (
      <EmptyPanel
        title="No screen modules configured"
        description="MODULE_ACTION_SCOPES (src/lib/chat/tool-scope.ts) is empty — nothing to simulate yet."
      />
    )
  }

  const toolDelta = data.unscoped.toolCount - scopedView.toolCount
  const payloadReductionPct =
    data.unscoped.payloadChars === 0 ? 0 : 100 * (1 - scopedView.payloadChars / data.unscoped.payloadChars)

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Signed in as {data.viewer.name}</CardTitle>
          <CardDescription>
            {data.viewer.email} — roles: {data.viewer.roles.join(", ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-body-subtle text-sm">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">MISSY_TOOL_SCOPING={data.envScoping}</code>{" "}
          is the live setting for real chat traffic. The scoped views below are computed directly (bypassing
          that pin) so you can preview scoping before flipping it.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scope simulator</CardTitle>
          <CardDescription>
            Pick a screen to simulate — the difference between the two cards is what narrowing Missy&rsquo;s
            toolset to that screen would buy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="dev-tools-module" className="text-sm font-medium text-heading">
              Simulate screen
            </label>
            <Select value={selectedModule} onValueChange={value => setSelectedModule(value ?? selectedModule)}>
              <SelectTrigger id="dev-tools-module" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.moduleOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Unscoped" view={data.unscoped} />
            <StatCard title="Scoped to this screen" view={scopedView} emphasis />
          </div>

          <p className="text-body-subtle text-sm">
            Scoping to <strong className="font-medium text-heading">{scopedView.label}</strong> drops{" "}
            <strong className="font-medium text-heading">{toolDelta}</strong> tool(s) and{" "}
            <strong className="font-medium text-heading">{payloadReductionPct.toFixed(1)}%</strong> of the
            schema payload for this role.
          </p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={value => setTab(value === "unscoped" ? "unscoped" : "scoped")}>
        <TabsList>
          <TabsTrigger value="unscoped">Unscoped detail ({data.unscoped.toolCount})</TabsTrigger>
          <TabsTrigger value="scoped">Scoped detail ({scopedView.toolCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="unscoped">
          <ViewDetail view={data.unscoped} />
        </TabsContent>
        <TabsContent value="scoped">
          <ViewDetail view={scopedView} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
