"use client"

import { useState, type FormEvent } from "react"
import { AlertTriangle, Building2, MoreHorizontal } from "lucide-react"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { DataTable, type DataTableColumn } from "@/components/data/data-table"
import {
  filterBySearch,
  paginateRows,
  sortRows,
  type ListScreenState,
  type SortState,
} from "@/components/data/list-state"
import { RelationTypeahead, type RelationOption } from "@/components/data/relation-typeahead"
import { ConfirmDialog } from "@/components/data/confirm-dialog"
import { FormField } from "@/components/data/form/form-field"
import { FormSection } from "@/components/data/form/form-section"
import { FormFooter } from "@/components/data/form/form-footer"
import { isDirty, requiredString } from "@/components/data/form/form-state"
import type { ActionResult } from "@/platform/errors"

/**
 * Dev-only design-system reference. Not linked from the main nav.
 * Demonstrates the terracotta token set, a hand-built table, a plain
 * controlled form, a static money-formatted field, the confirmation-card
 * pattern high-risk actions use, and — the main event — the shared `src/components/data/**`
 * primitives (DataTable, RelationTypeahead, FormField/Section/Footer, ConfirmDialog)
 * against fixture data, so a screen can be configured from this page's examples
 * before any domain screens exist.
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

// ---------------------------------------------------------------------------
// DataTable demo
// ---------------------------------------------------------------------------

interface DepartmentFixture {
  id: string
  name: string
  code: string
  headcount: number
  status: "active" | "archived"
}

const DEPARTMENT_FIXTURES: DepartmentFixture[] = [
  { id: "1", name: "Finance", code: "FIN", headcount: 12, status: "active" },
  { id: "2", name: "Engineering", code: "ENG", headcount: 34, status: "active" },
  { id: "3", name: "Human Resources", code: "HR", headcount: 8, status: "active" },
  { id: "4", name: "Payroll", code: "PAY", headcount: 5, status: "active" },
  { id: "5", name: "Sales", code: "SAL", headcount: 21, status: "active" },
  { id: "6", name: "Marketing", code: "MKT", headcount: 9, status: "active" },
  { id: "7", name: "Legal", code: "LEG", headcount: 3, status: "active" },
  { id: "8", name: "Facilities", code: "FAC", headcount: 6, status: "archived" },
  { id: "9", name: "Customer Support", code: "SUP", headcount: 17, status: "active" },
  { id: "10", name: "IT Operations", code: "ITO", headcount: 11, status: "active" },
  { id: "11", name: "Procurement", code: "PRC", headcount: 4, status: "archived" },
  { id: "12", name: "Quality Assurance", code: "QA", headcount: 14, status: "active" },
]

type DataTableDemoStatus = "ready" | "loading" | "error" | "no-permission"

const PAGE_SIZE = 5

function getSortValue(row: DepartmentFixture, columnId: string): string | number | undefined {
  if (columnId === "name") return row.name
  if (columnId === "code") return row.code
  if (columnId === "headcount") return row.headcount
  return undefined
}

function DataTableDemo() {
  const [demoStatus, setDemoStatus] = useState<DataTableDemoStatus>("ready")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [page, setPage] = useState(1)

  const filtered = filterBySearch(DEPARTMENT_FIXTURES, search, row => `${row.name} ${row.code}`)
  const sorted = sortRows(filtered, sort, getSortValue)
  const { pageRows, page: clampedPage } = paginateRows(sorted, page, PAGE_SIZE)

  const state: ListScreenState<DepartmentFixture> =
    demoStatus === "ready"
      ? { status: "ready", items: pageRows }
      : demoStatus === "loading"
        ? { status: "loading" }
        : demoStatus === "error"
          ? { status: "error", message: "Couldn't reach the server. Check your connection and try again." }
          : { status: "no-permission" }

  const columns: DataTableColumn<DepartmentFixture>[] = [
    { id: "name", header: "Department", cell: row => row.name, sortable: true },
    { id: "code", header: "Code", cell: row => row.code, sortable: true },
    {
      id: "headcount",
      header: "Headcount",
      cell: row => row.headcount,
      sortable: true,
      align: "right",
    },
    {
      id: "status",
      header: "Status",
      cell: row => (
        <Badge variant={row.status === "active" ? "success" : "secondary"}>
          {row.status === "active" ? "Active" : "Archived"}
        </Badge>
      ),
    },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="ds-table-status" className="text-sm font-medium text-heading">
          Demo state
        </label>
        <Select value={demoStatus} onValueChange={value => setDemoStatus((value ?? "ready") as DataTableDemoStatus)}>
          <SelectTrigger id="ds-table-status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="loading">Loading</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="no-permission">No permission</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        aria-label="Departments"
        state={state}
        columns={columns}
        getRowId={row => row.id}
        onRetry={() => setDemoStatus("ready")}
        noPermission={{ description: "Department management is restricted to Admins and HR." }}
        emptyState={{
          icon: Building2,
          title: "No departments yet",
          description: "Create the first department to get started.",
          action: { label: "Add department", onClick: () => setDemoStatus("ready") },
        }}
        search={{
          value: search,
          onChange: value => {
            setSearch(value)
            setPage(1)
          },
          placeholder: "Search departments…",
          "aria-label": "Search departments",
        }}
        sort={{
          value: sort,
          onChange: next => {
            setSort(next)
            setPage(1)
          },
        }}
        pagination={{ page: clampedPage, pageSize: PAGE_SIZE, totalItems: sorted.length, onPageChange: setPage }}
        toolbarEnd={<Button size="sm">Add department</Button>}
        rowActions={row => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon-sm">
                  <MoreHorizontal aria-hidden="true" />
                  <span className="sr-only">Actions for {row.name}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// RelationTypeahead demo — fixture "positions" with quick create and
// create-and-edit, both wired to visibly work against in-memory fixture data.
// ---------------------------------------------------------------------------

const INITIAL_POSITIONS: RelationOption[] = [
  { id: "pos-1", label: "Payroll Officer", description: "PAY-01" },
  { id: "pos-2", label: "Software Engineer", description: "ENG-04" },
  { id: "pos-3", label: "HR Assistant", description: "HR-02" },
  { id: "pos-4", label: "Recruiter", description: "HR-03" },
]

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms))
}

function PositionCreateForm({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string
  onCreated: (option: RelationOption) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = requiredString("Enter a position title.")(title)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setSubmitting(true)
    await delay(undefined, 400)
    setSubmitting(false)
    onCreated({ id: `pos-${Date.now()}`, label: result.value })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField id="ds-new-position-title" label="Title" required error={error}>
        {controlProps => (
          <Input
            {...controlProps}
            value={title}
            onChange={e => {
              setTitle(e.target.value)
              setError(null)
            }}
            autoFocus
          />
        )}
      </FormField>
      <FormFooter onCancel={onCancel} submitting={submitting} saveLabel="Create position" />
    </form>
  )
}

function RelationTypeaheadDemo() {
  const [positions, setPositions] = useState<RelationOption[]>(INITIAL_POSITIONS)
  const [employeeName, setEmployeeName] = useState("")
  const [position, setPosition] = useState<RelationOption | null>(null)

  async function loadOptions(query: string): Promise<ActionResult<{ options: RelationOption[] }>> {
    await delay(undefined, 300)
    if (query.trim().toLocaleLowerCase() === "error") {
      return { ok: false, error: { code: "INTERNAL", message: "Simulated search failure — try clearing the field." } }
    }
    const trimmed = query.trim().toLocaleLowerCase()
    const options =
      trimmed === "" ? positions : positions.filter(option => option.label.toLocaleLowerCase().includes(trimmed))
    return { ok: true, data: { options } }
  }

  async function onQuickCreate(name: string): Promise<ActionResult<RelationOption>> {
    await delay(undefined, 400)
    const created: RelationOption = { id: `pos-${Date.now()}`, label: name }
    setPositions(prev => [...prev, created])
    return { ok: true, data: created }
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-body-subtle">
        Try searching for something not in the list (e.g. &ldquo;Benefits Analyst&rdquo;), then use{" "}
        <strong className="font-medium text-heading">Create</strong> or{" "}
        <strong className="font-medium text-heading">Create and edit&hellip;</strong> — the &ldquo;Employee name&rdquo;
        field above keeps its value the whole time. Type &ldquo;error&rdquo; to see the search error state.
      </p>

      <FormField id="ds-employee-name" label="Employee name">
        {controlProps => (
          <Input {...controlProps} value={employeeName} onChange={e => setEmployeeName(e.target.value)} />
        )}
      </FormField>

      <FormField id="ds-position" label="Position" required hint="Type to search, or create a new one.">
        {controlProps => (
          <RelationTypeahead
            {...controlProps}
            value={position}
            onChange={setPosition}
            loadOptions={loadOptions}
            onQuickCreate={onQuickCreate}
            renderCreateForm={({ initialName, onCreated, onCancel }) => (
              <PositionCreateForm initialName={initialName} onCreated={onCreated} onCancel={onCancel} />
            )}
            entityLabel="position"
            emptyLabel="No positions found."
            placeholder="Search positions…"
          />
        )}
      </FormField>

      <p className="text-sm text-body-subtle">
        Selected: <span className="font-medium text-heading">{position ? position.label : "none"}</span>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form primitives demo — FormField / FormSection / FormFooter, with dirty-state
// tracking and inline validation feeding aria-describedby.
// ---------------------------------------------------------------------------

const INITIAL_DEPARTMENT_FORM = { name: "", code: "" }

function FormPrimitivesDemo() {
  const [values, setValues] = useState(INITIAL_DEPARTMENT_FORM)
  const [nameError, setNameError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const dirty = isDirty(INITIAL_DEPARTMENT_FORM, values)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = requiredString("Enter a department name.")(values.name)
    if (!result.ok) {
      setNameError(result.message)
      return
    }
    setNameError(null)
    setSavedMessage(`Saved "${result.value}".`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-6">
      <FormSection title="Basic info" description="Required fields are marked with an asterisk.">
        <FormField id="ds-dept-name" label="Name" required error={nameError}>
          {controlProps => (
            <Input
              {...controlProps}
              value={values.name}
              onChange={e => {
                setValues(v => ({ ...v, name: e.target.value }))
                setNameError(null)
                setSavedMessage(null)
              }}
            />
          )}
        </FormField>
        <FormField id="ds-dept-code" label="Code" hint="Short internal code, e.g. FIN.">
          {controlProps => (
            <Input
              {...controlProps}
              value={values.code}
              onChange={e => {
                setValues(v => ({ ...v, code: e.target.value }))
                setSavedMessage(null)
              }}
            />
          )}
        </FormField>
      </FormSection>

      {savedMessage && <p className="text-sm text-fg-success">{savedMessage}</p>}

      <FormFooter
        isDirty={dirty}
        onCancel={() => {
          setValues(INITIAL_DEPARTMENT_FORM)
          setNameError(null)
          setSavedMessage(null)
        }}
        saveLabel="Create department"
      />
    </form>
  )
}

// ---------------------------------------------------------------------------
// ConfirmDialog demo
// ---------------------------------------------------------------------------

function ConfirmDialogDemo() {
  const [open, setOpen] = useState(false)
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Switch checked={simulateFailure} onCheckedChange={setSimulateFailure} id="ds-confirm-fail" />
        <label htmlFor="ds-confirm-fail" className="text-sm text-heading">
          Simulate server error on confirm
        </label>
      </div>
      <Button variant="destructive" className="w-fit" onClick={() => setOpen(true)}>
        Archive department
      </Button>
      {result && <p className="text-sm text-body-subtle">{result}</p>}

      <ConfirmDialog<{ id: string }>
        open={open}
        onOpenChange={setOpen}
        title="Archive department"
        description={
          <>
            <strong className="font-medium text-heading">Finance</strong> will be hidden from new employee
            assignments. Existing employees keep their current department.
          </>
        }
        confirmLabel="Archive"
        onConfirm={async () => {
          await delay(undefined, 400)
          if (simulateFailure) {
            return { ok: false, error: { code: "INTERNAL", message: "Couldn't archive department. Try again." } }
          }
          return { ok: true, data: { id: "1" } }
        }}
        onSuccess={data => {
          setResult(`Archived department ${data.id}.`)
          setOpen(false)
        }}
      />
    </div>
  )
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-12 px-4 py-8 sm:px-6 lg:py-10">
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

      <Separator />

      <div>
        <h2 className="text-xl font-medium text-heading">Shared data components (src/components/data)</h2>
        <p className="tc-measure mt-1 text-body-subtle">
          The DRY primitives every model screen (04&ndash;14) configures instead of reimplementing.
        </p>
      </div>

      <section className="flex min-w-0 flex-col gap-4">
        <h3 className="text-lg font-medium text-heading">DataTable</h3>
        <p className="text-sm text-body-subtle">
          Column config, sorting, client-side search and paging, row actions, and all four required states
          (loading / empty / error / no-permission) — switch &ldquo;Demo state&rdquo; below to see each one.
        </p>
        <DataTableDemo />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-medium text-heading">RelationTypeahead</h3>
        <p className="text-sm text-body-subtle">
          Odoo-style relation picker: search, and when there&rsquo;s no match, &ldquo;Create&rdquo; and
          &ldquo;Create and edit&hellip;&rdquo; rows, reachable with the keyboard the same way as any other option.
        </p>
        <RelationTypeaheadDemo />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-medium text-heading">Form primitives</h3>
        <p className="text-sm text-body-subtle">
          FormField (labelled control + inline error via aria-describedby, required marked beyond colour alone),
          FormSection, and FormFooter (dirty-state-aware Cancel).
        </p>
        <FormPrimitivesDemo />
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-medium text-heading">ConfirmDialog</h3>
        <p className="text-sm text-body-subtle">
          Shared high-risk-action confirmation, consistent with the one already on the Users screen.
        </p>
        <ConfirmDialogDemo />
      </section>
    </div>
  )
}
