"use client"

import { useRouter } from "next/navigation"

import { EmployeeForm } from "@/components/employee/employee-form"

export function NewEmployeeScreen() {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="tc-app-title">Add employee</h1>
      <EmployeeForm
        mode="create"
        onSaved={result => router.push(`/app/employees/${result.id}`)}
        onCancel={() => router.push("/app/employees")}
      />
    </div>
  )
}
