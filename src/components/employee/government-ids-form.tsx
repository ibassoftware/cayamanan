"use client"

// Bare edit form for an employee's government IDs (SSS/PhilHealth/Pag-IBIG/TIN) —
// ADMIN/HR_PAYROLL only, per `employee.updateGovernmentIds`'s role list. Rendered from
// the Government IDs tab of `/app/employees/[id]` (never from the self-service profile,
// which is read-only in this slice).
import { useId, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/data/form/form-field"
import { FormFooter } from "@/components/data/form/form-footer"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { EmployeeGovernmentIds } from "@/components/employee/employee-state"

export interface GovernmentIdsFormProps {
  employeeId: string
  governmentIds: EmployeeGovernmentIds | null
  onSaved: (governmentIds: EmployeeGovernmentIds) => void
  onCancel: () => void
}

export function GovernmentIdsForm({ employeeId, governmentIds, onSaved, onCancel }: GovernmentIdsFormProps) {
  const router = useRouter()
  const sssId = useId()
  const philhealthId = useId()
  const pagibigId = useId()
  const tinId = useId()
  const hdmfId = useId()

  const [sssNo, setSssNo] = useState(governmentIds?.sssNo ?? "")
  const [philhealthNo, setPhilhealthNo] = useState(governmentIds?.philhealthNo ?? "")
  const [pagibigNo, setPagibigNo] = useState(governmentIds?.pagibigNo ?? "")
  const [tin, setTin] = useState(governmentIds?.tin ?? "")
  const [hdmfMid, setHdmfMid] = useState(governmentIds?.hdmfMid ?? "")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await callAction<{ employeeId: string }>("employee.updateGovernmentIds", {
      employeeId,
      sssNo: sssNo.trim() || null,
      philhealthNo: philhealthNo.trim() || null,
      pagibigNo: pagibigNo.trim() || null,
      tin: tin.trim() || null,
      hdmfMid: hdmfMid.trim() || null,
    })
    setSubmitting(false)

    if (!result.ok) {
      if (isSessionExpired(result)) {
        router.push(SESSION_EXPIRED_LOGIN_PATH)
        return
      }
      setError(result.error.message)
      return
    }

    onSaved({
      sssNo: sssNo.trim() || null,
      philhealthNo: philhealthNo.trim() || null,
      pagibigNo: pagibigNo.trim() || null,
      tin: tin.trim() || null,
      hdmfMid: hdmfMid.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={sssId} label="SSS no.">
          {controlProps => <Input {...controlProps} value={sssNo} onChange={e => setSssNo(e.target.value)} autoFocus />}
        </FormField>
        <FormField id={philhealthId} label="PhilHealth no.">
          {controlProps => <Input {...controlProps} value={philhealthNo} onChange={e => setPhilhealthNo(e.target.value)} />}
        </FormField>
        <FormField id={pagibigId} label="Pag-IBIG no.">
          {controlProps => <Input {...controlProps} value={pagibigNo} onChange={e => setPagibigNo(e.target.value)} />}
        </FormField>
        <FormField id={tinId} label="TIN">
          {controlProps => <Input {...controlProps} value={tin} onChange={e => setTin(e.target.value)} />}
        </FormField>
        <FormField id={hdmfId} label="HDMF MID">
          {controlProps => <Input {...controlProps} value={hdmfMid} onChange={e => setHdmfMid(e.target.value)} />}
        </FormField>
      </div>

      <FormFooter onCancel={onCancel} submitting={submitting} saveLabel="Save" />
    </form>
  )
}
