"use client"

import { Suspense, useId, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { callAction } from "@/lib/actions-client"
import { resolveLoginRedirect } from "./login-state"
import type { Role } from "@/platform/actions"

interface LoginOutput {
  user: { id: string; email: string; name: string; roles: Role[] }
  mustChangePassword: boolean
}

function SessionExpiredBanner() {
  const searchParams = useSearchParams()
  if (searchParams.get("sessionExpired") !== "1") return null

  return (
    <Alert role="alert" className="mb-4">
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
    </Alert>
  )
}

function LoginForm() {
  const router = useRouter()
  const emailFieldId = useId()
  const passwordFieldId = useId()
  const errorId = useId()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const result = await callAction<LoginOutput>("identity.login", { email, password })

    if (!result.ok) {
      // Covers both the "invalid credentials" and "locked-out" states: the server
      // already returns distinct, safe-to-show text for each (never distinguishing
      // "unknown email" from "wrong password" — 02-identity-auth.md criterion 5), so
      // the form just surfaces whichever message came back rather than re-deriving it.
      setSubmitting(false)
      setError(result.error.message)
      return
    }

    const destination = resolveLoginRedirect(result.data.user, result.data.mustChangePassword)
    const query = result.data.mustChangePassword ? "?mustChangePassword=1" : ""
    router.push(`${destination}${query}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive" role="alert" id={errorId}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailFieldId} className="text-sm font-medium text-heading">
          Email
        </label>
        <Input
          id={emailFieldId}
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordFieldId} className="text-sm font-medium text-heading">
          Password
        </label>
        <Input
          id={passwordFieldId}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <Button type="submit" disabled={submitting} className="mt-2">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Sign in to Cayamanan</CardTitle>
          <CardDescription>Use your work email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <SessionExpiredBanner />
          </Suspense>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  )
}
