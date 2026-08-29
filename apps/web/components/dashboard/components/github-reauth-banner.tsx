"use client"

import React, { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Github, Loader2 } from "lucide-react"
import { signIn } from "@/lib/auth-client"
import { getGithubConnectionStatus } from "@/modules/dashboard/actions"

export function GithubReauthBanner() {
  const queryClient = useQueryClient()
  const [isReconnecting, setIsReconnecting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["github-auth-status"],
    queryFn: async () => getGithubConnectionStatus(),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  })

  if (isLoading || !data?.needsReauth) return null

  const handleReconnect = async () => {
    setIsReconnecting(true)
    try {
      await signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      })
      await queryClient.invalidateQueries()
    } catch (error) {
      console.error("GitHub reconnect failed:", error)
      setIsReconnecting(false)
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3 border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">
            GitHub authorization expired
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Stats, PRs, and analytics need a fresh GitHub login. Reconnect once — tokens refresh automatically afterward.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleReconnect}
        disabled={isReconnecting}
        className="inline-flex shrink-0 items-center justify-center gap-2 border border-primary/40 bg-primary/10 px-3 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
      >
        {isReconnecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Github className="h-3.5 w-3.5" />
        )}
        {isReconnecting ? "Redirecting…" : "Reconnect GitHub"}
      </button>
    </div>
  )
}
