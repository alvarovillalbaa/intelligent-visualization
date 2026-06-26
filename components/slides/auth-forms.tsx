"use client"

import { useActionState } from "react"

import { signInAction, signUpAction, type AuthFormState } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const initialState: AuthFormState = {}

export function AuthForms({
  defaultMode = "signin",
  returnTo = "/app",
}: {
  defaultMode?: "signin" | "signup"
  returnTo?: string
}) {
  const [signInState, signInFormAction, signInPending] = useActionState(signInAction, initialState)
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, initialState)

  const signInCard = (
    <Card className="border-0 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold">Sign in</CardTitle>
        <CardDescription>Open your saved workspaces and visualizations.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signInFormAction} className="grid gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="sign-in-email">
              Email
            </label>
            <Input id="sign-in-email" name="email" placeholder="you@company.com" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="sign-in-password">
              Password
            </label>
            <Input id="sign-in-password" name="password" type="password" />
          </div>
          {signInState.error ? (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {signInState.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={signInPending}>
            {signInPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )

  const signUpCard = (
    <Card className="border-0 bg-[#111513] text-white shadow-[0_24px_90px_rgba(17,21,19,0.22)]">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-white">Create account</CardTitle>
        <CardDescription className="text-white/72">
          Save guest drafts, sources, and visualization versions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signUpFormAction} className="grid gap-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="sign-up-name">
              Name
            </label>
            <Input
              id="sign-up-name"
              name="name"
              placeholder="Taylor Brooks"
              className="border-white/12 bg-white/8 text-white placeholder:text-white/40"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="sign-up-team">
              Team
            </label>
            <Input
              id="sign-up-team"
              name="teamName"
              placeholder="Acme Studio"
              className="border-white/12 bg-white/8 text-white placeholder:text-white/40"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="sign-up-email">
              Email
            </label>
            <Input
              id="sign-up-email"
              name="email"
              type="email"
              placeholder="you@company.com"
              className="border-white/12 bg-white/8 text-white placeholder:text-white/40"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-white" htmlFor="sign-up-password">
              Password
            </label>
            <Input
              id="sign-up-password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              className="border-white/12 bg-white/8 text-white placeholder:text-white/40"
            />
          </div>
          {signUpState.error ? (
            <p className="rounded-lg bg-white/8 px-4 py-3 text-sm text-white">
              {signUpState.error}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="bg-white text-[#111513] hover:bg-white/90"
            disabled={signUpPending}
          >
            {signUpPending ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      {defaultMode === "signup" ? signUpCard : signInCard}
      {defaultMode === "signup" ? signInCard : signUpCard}
    </div>
  )
}
