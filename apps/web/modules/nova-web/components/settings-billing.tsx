"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Receipt, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { requestJson } from "@/modules/nova-web/api"
import { ChoosePlanModal } from "@/modules/nova-web/components/choose-plan-modal"

type BillingPlan = {
  name: "Free" | "Spark" | "Pro" | "Ultra" | null
  tier: string | null
  displayPrice: string | null
  renewsAt: string | null
  cancelAtPeriodEnd: boolean
  isGrandfathered: boolean
}

type BillingState = {
  loading: boolean
  error: string | null
  plan: BillingPlan
  balanceUsd: number | null
  totalCreditsUsd: number | null
  spentThisPeriodUsd: number | null
  resetAt: string | null
  source: "harness" | "none" | null
}

const INITIAL_BILLING: BillingState = {
  loading: true,
  error: null,
  plan: {
    name: null,
    tier: null,
    displayPrice: null,
    renewsAt: null,
    cancelAtPeriodEnd: false,
    isGrandfathered: false,
  },
  balanceUsd: 0,
  totalCreditsUsd: 0,
  spentThisPeriodUsd: 0,
  resetAt: null,
  source: null,
}

export function BillingSection() {
  const [state, setState] = useState<BillingState>(INITIAL_BILLING)
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const info = await requestJson<{
        planName?: "Free" | "Spark" | "Pro" | "Ultra" | null
        planTier?: string | null
        planDisplayPrice?: string | null
        renewsAt?: string | null
        cancelAtPeriodEnd?: boolean
        isGrandfathered?: boolean
        balanceUsd?: number | null
        totalCreditsUsd?: number | null
        spentThisPeriodUsd?: number | null
        resetAt?: string | null
        source?: "harness" | "none" | null
      }>("/api/nova/settings/billing")
      setState({
        loading: false,
        error: null,
        plan: {
          name: info.planName ?? null,
          tier: info.planTier ?? null,
          displayPrice: info.planDisplayPrice ?? null,
          renewsAt: info.renewsAt ?? null,
          cancelAtPeriodEnd: Boolean(info.cancelAtPeriodEnd),
          isGrandfathered: Boolean(info.isGrandfathered),
        },
        balanceUsd: info.balanceUsd ?? 0,
        totalCreditsUsd: info.totalCreditsUsd ?? 0,
        spentThisPeriodUsd: info.spentThisPeriodUsd ?? 0,
        resetAt: info.resetAt ?? null,
        source: info.source ?? null,
      })
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load billing information",
      }))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasPlan = Boolean(state.plan.name && state.plan.name !== "Free")
  const renewsLabel = state.plan.renewsAt
    ? new Date(state.plan.renewsAt).toLocaleDateString()
    : null
  const resetsLabel = state.resetAt
    ? new Date(state.resetAt).toLocaleDateString()
    : null
  const totalCredits = state.totalCreditsUsd ?? 0
  const hasCredits = totalCredits > 0
  const spentThisPeriod = state.spentThisPeriodUsd ?? 0
  const spentPct =
    hasCredits && state.spentThisPeriodUsd != null
      ? Math.min(100, Math.round((spentThisPeriod / totalCredits) * 100))
      : null

  return (
    <>
      <div>
        <h1 className="text-[28px] font-medium tracking-tight">Billing</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Plan, balance, and invoices for this organization
        </p>
      </div>

      {state.error ? (
        <p className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-300">
          {state.error}
        </p>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            {state.loading ? (
              <p className="flex items-center gap-2 text-[13.5px] text-[#a0a0a0]">
                <Loader2 className="size-3.5 animate-spin" />
                Loading plan…
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-medium text-white">
                    {state.plan.name ?? "Free"} plan
                  </p>
                  {state.plan.displayPrice ? (
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/75 tabular-nums">
                      {state.plan.displayPrice}
                    </span>
                  ) : null}
                  {state.plan.isGrandfathered ? (
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      Grandfathered
                    </span>
                  ) : null}
                  {renewsLabel ? (
                    <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/75">
                      {state.plan.cancelAtPeriodEnd
                        ? `Ends ${renewsLabel}`
                        : `Renews ${renewsLabel}`}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-5 text-[#6b6b6b]">
                  {hasPlan
                    ? "Recurring monthly subscription with included credits."
                    : "Credits only, no recurring plan"}
                </p>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {hasPlan ? (
              <button
                type="button"
                onClick={() => setManageOpen((v) => !v)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-[12.5px] text-[#e4e4e4] transition hover:bg-white/[0.07]"
              >
                <Wallet className="size-3.5" />
                Manage plan
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPlanModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[12.5px] font-medium text-black transition hover:bg-white/90 active:scale-[0.98]"
            >
              {hasPlan ? "Change plan" : "Choose a plan"}
            </button>
          </div>
        </div>

        {manageOpen && hasPlan ? (
          <div className="border-t border-white/[0.06] bg-[#161616] px-5 py-3">
            <ManagePlanRow
              onTopUp={() => {
                setManageOpen(false)
                setPlanModalOpen(true)
              }}
              onCancel={() => setManageOpen(false)}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <div className="flex items-baseline justify-between gap-3 px-5 py-4">
          <p className="text-[14px] font-medium text-white">Balance</p>
          <p className="text-[18px] font-medium tracking-tight tabular-nums">
            {state.loading
              ? "$0.00"
              : `$${(state.balanceUsd ?? 0).toFixed(2)}`}
          </p>
        </div>

        {hasCredits && spentPct != null ? (
          <>
            <div className="h-1.5 w-full bg-white/[0.04]">
              <div
                className={cn(
                  "h-full transition-all",
                  spentPct > 90
                    ? "bg-[#f87171]"
                    : spentPct > 60
                      ? "bg-[#fbbf24]"
                      : "bg-[#2dd4bf]",
                )}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3 text-[12px] text-[#6b6b6b]">
              <span>
                Used ${(state.spentThisPeriodUsd ?? 0).toFixed(2)} of $
                {state.totalCreditsUsd?.toFixed(2)} this period
                {resetsLabel ? ` · resets ${resetsLabel}` : null}
              </span>
              <button
                type="button"
                onClick={() => setPlanModalOpen(true)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#e4e4e4] transition hover:text-white"
              >
                <Plus className="size-3" />
                Add balance
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-[12px] text-[#6b6b6b]">
            <span>
              {state.loading
                ? "Loading balance…"
                : hasPlan
                  ? `${state.plan.name} credits auto-renew next period`
                  : "Track credits and top up your account"}
            </span>
            <button
              type="button"
              onClick={() => setPlanModalOpen(true)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#e4e4e4] transition hover:text-white"
            >
              <Plus className="size-3" />
              Add balance
            </button>
          </div>
        )}
      </div>

      <h2 className="mt-10 text-[13px] font-medium text-[#a0a0a0]">Invoices</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414]">
        <div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_36px] gap-2 border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#5c5c5c]">
          <span>Invoice</span>
          <span>Date</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {state.loading ? (
          <p className="flex items-center gap-2 px-4 py-8 text-[13px] text-[#6b6b6b]">
            <Loader2 className="size-3.5 animate-spin" /> Loading billing history…
          </p>
        ) : hasPlan ? (
          <div className="flex items-center gap-3 px-5 py-6 text-[13px] text-[#a0a0a0]">
            <Receipt className="size-4 text-[#6b6b6b]" />
            Invoices for the {state.plan.name} plan arrive by email each renewal.
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-6 text-[13px] text-[#6b6b6b]">
            <Receipt className="size-4" />
            No invoices yet. Pick a plan to start a recurring subscription.
          </div>
        )}
      </div>

      <ChoosePlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
      />
    </>
  )
}

function ManagePlanRow({
  onTopUp,
  onCancel,
}: {
  onTopUp: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
      <button
        type="button"
        onClick={onTopUp}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[#e4e4e4] transition hover:bg-white/[0.07]"
      >
        <Plus className="size-3" />
        Top up balance
      </button>
      <a
        href="https://nova.supercodeai.tech/studio?portal=true"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 text-[#e4e4e4] transition hover:bg-white/[0.07]"
      >
        Open Dodo portal
      </a>
      <button
        type="button"
        onClick={onCancel}
        className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[#a0a0a0] transition hover:text-white"
      >
        Close
      </button>
    </div>
  )
}
