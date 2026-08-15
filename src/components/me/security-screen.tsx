"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { ChangePasswordForm } from "@/components/me/change-password-form"

function MustChangePasswordBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get("mustChangePassword") !== "1") return null

  return (
    <Alert role="alert" className="mb-6 max-w-lg">
      <AlertDescription>
        You must change your password before continuing.
      </AlertDescription>
    </Alert>
  )
}

export function SecurityScreen() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="tc-app-title">Security</h1>

      <Suspense fallback={null}>
        <MustChangePasswordBanner />
      </Suspense>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Change your password</CardTitle>
          <CardDescription>
            You&rsquo;ll need your current password to set a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
