"use client"

import { useEffect, useState } from "react"
import { Github } from "lucide-react"

import { NovaIcon } from "@/modules/nova-web/components/nova-icon"

import { signIn, useSession } from "@/lib/auth-client"

export function NovaLogin() {
  const { data, isPending } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && data?.session) window.location.replace("/")
  }, [data?.session, isPending])

  async function continueWithGitHub() {
    setIsLoading(true)
    setError(null)
    try {
      await signIn.social({
        provider: "github",
        callbackURL: window.location.origin,
        errorCallbackURL: `${window.location.origin}/login`,
      })
    } catch (signInError) {
      console.error("Nova sign in error:", signInError)
      setError("Could not connect to the Supercode authentication server.")
      setIsLoading(false)
    }
  }

  if (isPending || data?.session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0e0e10]">
        <div className="size-5 animate-spin rounded-full border border-zinc-700 border-t-zinc-200" />
      </main>
    )
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0e0e10] px-5 text-zinc-200">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-11 items-center justify-center overflow-hidden rounded-xl">
            <NovaIcon size="lg" alt="" className="size-11" />
          </div>
          <h1 className="mt-5 text-[26px] font-medium tracking-[-0.04em]">Welcome to Nova</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-500">
            Use your Supercode account to continue. New users are registered automatically.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#151517] p-4">
          <button
            type="button"
            onClick={continueWithGitHub}
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px] font-medium text-zinc-200 transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <div className="size-4 animate-spin rounded-full border border-zinc-600 border-t-zinc-200" />
            ) : (
              <Github className="size-4" />
            )}
            {isLoading ? "Connecting…" : "Continue with GitHub"}
          </button>
          {error ? (
            <p className="mt-3 rounded-lg border border-red-500/15 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-700">
          Supercode CLI account · shared users and organizations
        </p>
      </div>
    </main>
  )
}
