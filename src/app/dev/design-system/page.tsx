"use client"

import { useState, type FormEvent } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"

/**
 * Dev-only design-system reference. Not linked from the main nav.
 * Demonstrates the terracotta token set, a hand-built table, a plain
 * controlled form, a static money-formatted field, and the confirmation-card
 * pattern high-risk actions will use once the action layer lands.
 */

type Swatch = {
  name: string
  token: string
  className: string
  textClassName?: string
}

const SURFACE_SWATCHES: Swatch[] = [
  { name: "Surface", token: "--tc-neutral-primary", className: "bg-surface" },
  { name: "Card", token: "--tc-neutral-tertiary", className: "bg-card" },
  { name: "Muted", token: "--tc-neutral-tertiary", className: "bg-muted" },
  { name: "Accent (hover)", token: "--tc-neutral-tertiary-medium", className: "bg-accent" },
  { name: "Border control", token: "--tc-border-control", className: "bg-border-control" },
]

const BRAND_SWATCHES: Swatch[] = [
  { name: "Brand softer", token: "--tc-brand-softer", className: "bg-brand-softer" },
  { name: "Brand soft", token: "--tc-brand-soft", className: "bg-brand-soft" },
  {
    name: "Brand accessible",
    token: "--tc-brand-accessible",
    className: "bg-primary",
    textClassName: "text-primary-foreground",
  },
  {
    name: "Brand strong",
    token: "--tc-brand-strong",
    className: "bg-brand-strong",
    textClassName: "text-white",
  },
]

const STATUS_SWATCHES: Swatch[] = [
  {
    name: "Success",
    token: "--tc-success-soft / --tc-fg-success",
    className: "bg-success-soft",
    textClassName: "text-fg-success",
  },
  {
    name: "Warning",
    token: "--tc-warning-soft / --tc-fg-warning",
    className: "bg-warning-soft",
    textClassName: "text-fg-warning",
  },
  {
    name: "Danger",
    token: "--tc-danger-soft / --tc-fg-danger",
    className: "bg-danger-soft",
    textClassName: "text-fg-danger",
  },
]

function SwatchGrid({ swatches }: { swatches: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {swatches.map(swatch => (
        <div key={swatch.name} className="flex flex-col gap-2">
          <div
            className={`flex h-16 items-center justify-center rounded-lg ring-1 ring-foreground/10 ${swatch.className} ${swatch.textClassName ?? "text-heading"}`}
          >
            <span className="text-xs font-medium">Aa</span>
          </div>
          <div>
            <p className="text-sm text-heading">{swatch.name}</p>
            <p className="text-xs text-body-subtle">{swatch.token}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

type EmployeeRow = {
  id: string
  name: string
  position: string
  status: "active" | "on-leave" | "separated"
  monthlyRate: string
}

const EMPLOYEE_ROWS: EmployeeRow[] = [
  { id: "1", name: "Maria Santos", position: "Payroll Officer", status: "active", monthlyRate: "₱45,000.00" },
  { id: "2", name: "Juan Dela Cruz", position: "Software Engineer", status: "active", monthlyRate: "₱62,500.00" },
  { id: "3", name: "Liza Reyes", position: "HR Assistant", status: "on-leave", monthlyRate: "₱28,000.00" },
]

const STATUS_BADGE: Record<EmployeeRow["status"], { label: string; variant: "success" | "warning" | "secondary" }> = {
  active: { label: "Active", variant: "success" },
  "on-leave": { label: "On leave", variant: "warning" },
  separated: { label: "Separated", variant: "secondary" },
}

function EmployeeTable() {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-border border-b bg-muted text-left">
            <th scope="col" className="px-4 py-2 font-medium text-heading">
              Employee
            </th>
            <th scope="col" className="px-4 py-2 font-medium text-heading">
              Position
            </th>
            <th scope="col" className="px-4 py-2 font-medium text-heading">
              Status
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium text-heading">
              Monthly rate
            </th>
          </tr>
        </thead>
        <tbody>
          {EMPLOYEE_ROWS.map(row => {
            const status = STATUS_BADGE[row.status]

            return (
              <tr key={row.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-2 text-body">{row.name}</td>
                <td className="px-4 py-2 text-body-subtle">{row.position}</td>
                <td className="px-4 py-2">
                  <Badge variant={status.variant}>{status.label}</Badge>
                </td>
                <td className="px-4 py-2 text-right text-body [font-variant-numeric:tabular-nums]">
                  {row.monthlyRate}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const DEPARTMENTS = ["Payroll", "Engineering", "Human Resources"] as const

function ExampleForm() {
  const [fullName, setFullName] = useState("")
  const [department, setDepartment] = useState<string>("")
  const [notifyOnPayslip, setNotifyOnPayslip] = useState(true)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // UI-only demo — no callAction wiring until the action layer lands.
    event.preventDefault()
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ds-full-name" className="text-sm font-medium text-heading">
          Full name
        </label>
        <Input
          id="ds-full-name"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Juan Dela Cruz"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ds-department" className="text-sm font-medium text-heading">
          Department
        </label>
        <Select
          value={department}
          onValueChange={value => setDepartment(value ?? "")}
        >
          <SelectTrigger id="ds-department" className="w-full">
            <SelectValue placeholder="Select a department" />
          </SelectTrigger>
          <SelectContent>
            {DEPARTMENTS.map(dept => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-heading">
            Notify me when a payslip is ready
          </p>
          <p className="text-sm text-body-subtle">Takes effect immediately.</p>
        </div>
        <Switch checked={notifyOnPayslip} onCheckedChange={setNotifyOnPayslip} />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="reset" variant="secondary">
          Reset
        </Button>
        <Button type="submit">Save changes</Button>
      </div>
    </form>
  )
}

function MoneyFieldExample() {
  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <span className="text-sm font-medium text-heading">Net pay</span>
      {/* Static demo string only — money is formatted, never computed, in the UI. */}
      <p className="rounded-lg border border-border-control bg-card px-2.5 py-1.5 text-right text-lg text-heading [font-variant-numeric:tabular-nums]">
        ₱12,345.67
      </p>
    </div>
  )
}

function ConfirmationCardExample() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <div className="mb-1 flex items-center gap-2">
          <AlertTriangle className="size-4 text-fg-warning" aria-hidden="true" />
          <Badge variant="warning">High risk</Badge>
        </div>
        <CardTitle>Confirm salary change</CardTitle>
        <CardDescription>
          You are changing Juan Dela Cruz&rsquo;s monthly rate from ₱62,500.00
          to ₱68,000.00, effective next cutoff. This action is audited and
          cannot be undone from this screen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-body-subtle text-sm">
          Editing the amount after this point will void this confirmation.
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-3 bg-transparent">
        <Button variant="secondary">Cancel</Button>
        <Button variant="default">Confirm change</Button>
      </CardFooter>
    </Card>
  )
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6 lg:py-10">
      <div>
        <h1 className="tc-app-title mb-2">Design system reference</h1>
        <p className="tc-measure text-body-subtle">
          Dev-only page. Not linked from the app nav — verifies the terracotta
          token set and a handful of composite patterns slices will reuse.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">Surface tokens</h2>
        <SwatchGrid swatches={SURFACE_SWATCHES} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">Brand tokens</h2>
        <SwatchGrid swatches={BRAND_SWATCHES} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">Status tokens</h2>
        <SwatchGrid swatches={STATUS_SWATCHES} />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">Table</h2>
        <EmployeeTable />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">Form</h2>
        <ExampleForm />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">Money field</h2>
        <MoneyFieldExample />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-heading">
          Confirmation card (high-risk action)
        </h2>
        <ConfirmationCardExample />
      </section>
    </div>
  )
}
