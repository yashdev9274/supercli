"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Gauge, Loader2, RefreshCw } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { agentUsageSnapshotSchema } from "@/modules/nova/agent-usage/contracts"
import { PROVIDER_INTEGRATION_BY_ID } from "../provider-integrations"

export function AgentUsage({ userId, provider }: { userId: string; provider: string }) {
  const [open, setOpen] = useState(false)
  const { data, dataUpdatedAt, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ["nova-agent-usage", userId],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/nova/agent-usage", { credentials: "same-origin", cache: "no-store", signal })
      if (!response.ok) throw new Error("Agent usage could not be loaded. Try refreshing.")
      return agentUsageSnapshotSchema.parse(await response.json())
    },
    staleTime: 60_000,
    refetchInterval: open ? 60_000 : 120_000,
    refetchIntervalInBackground: false,
    retry: false,
  })

  useEffect(() => {
    const refresh = () => { void refetch() }
    window.addEventListener("nova:codex-connection", refresh)
    window.addEventListener("nova:provider-connection", refresh)
    return () => {
      window.removeEventListener("nova:codex-connection", refresh)
      window.removeEventListener("nova:provider-connection", refresh)
    }
  }, [refetch])

  if (data?.agents.length === 0 && !error) return null
  const selected = data?.agents.find((agent) => agent.provider === provider) ?? data?.agents[0]
  const remaining = selected?.windows[0]?.remainingPercent
  const showRemaining = !error && selected?.status === "available" && remaining !== undefined

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next)
      if (next && Date.now() - dataUpdatedAt >= 60_000 && !isFetching) void refetch()
    }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Coding agent usage" title="Coding agent usage" className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-[#999] transition hover:bg-white/[0.05] hover:text-[#ddd] focus-visible:outline-2 focus-visible:outline-white/60">
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Gauge className={cn("size-3.5", showRemaining && (remaining <= 10 ? "text-amber-300" : "text-emerald-400"))} />}
          <span className="hidden sm:inline">{selected?.label ?? "Agent usage"}</span>
          {showRemaining ? <span className="tabular-nums">{Math.round(remaining)}%</span> : <span className="sm:hidden">Usage</span>}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={10} className="dark max-h-[min(520px,var(--radix-popover-content-available-height))] w-[320px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border-white/[0.1] bg-[#1c1c1e] p-0 text-[#ededf0] shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-[13px] font-medium">Agent usage</h2>
          <button type="button" aria-label="Refresh agent usage" disabled={isFetching} onClick={() => { void refetch() }} className="rounded-md p-1 text-[#92929b] hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-white/60 disabled:opacity-50">
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
          </button>
        </div>
        {isPending ? <p role="status" className="border-t border-white/[0.07] px-4 py-6 text-[12px] text-[#a1a1aa]">Loading connected agents…</p> : null}
        {error ? <p role="alert" className="border-t border-white/[0.07] px-4 py-4 text-[12px] leading-5 text-amber-200">Agent usage could not be loaded. Refresh to try again.</p> : null}
        {!error ? data?.agents.map((agent) => {
          const logo = PROVIDER_INTEGRATION_BY_ID[agent.provider]?.logo
          return (
            <section key={agent.provider} aria-label={`${agent.label} usage`} className="border-t border-white/[0.07] px-4 py-4">
              <div className="mb-4 flex items-center gap-2">
                {logo ? <Image src={logo.src} width={18} height={18} alt="" unoptimized className={cn("size-[18px] rounded object-contain", logo.monochrome && "brightness-0 invert")} /> : <Gauge className="size-4 text-[#a1a1aa]" />}
                <h3 className="text-[13px] font-medium">{agent.label}</h3>
                {agent.plan ? <span className="ml-auto text-[11px] capitalize text-[#92929b]">{agent.plan.replaceAll("_", " ")}</span> : null}
              </div>
              {agent.status === "available" ? (
                <div className="space-y-4">
                  {agent.windows.map((window, index) => (
                    <div key={`${window.label}-${index}`}>
                      <div className="mb-2 flex items-baseline justify-between gap-2 text-[12px]"><span>{window.label}</span><span className="tabular-nums text-[#a1a1aa]">{Math.round(window.remainingPercent)}% left</span></div>
                      <div role="progressbar" aria-label={`${agent.label} ${window.label} remaining`} aria-valuenow={window.remainingPercent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                        <div style={{ width: `${window.remainingPercent}%` }} className={cn("h-full rounded-full", window.remainingPercent <= 10 ? "bg-amber-400" : "bg-emerald-400")} />
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-[#92929b]">{window.resetsAt ? `Resets ${new Date(window.resetsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Reset time not provided"}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[12px] leading-5 text-[#a1a1aa]">{agent.message ?? "Remaining usage is unavailable for this connection."}</p>}
            </section>
          )
        }) : null}
        {data ? <p className="border-t border-white/[0.07] px-4 py-3 text-[10px] leading-4 text-[#92929b]">Provider-reported limits · {error ? "Last successful update" : "Updated"} {new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}. This is separate from Nova credits.</p> : null}
      </PopoverContent>
    </Popover>
  )
}
