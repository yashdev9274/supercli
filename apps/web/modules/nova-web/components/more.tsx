"use client"

import {
  Activity,
  Bug,
  GitPullRequest,
  Shield,
  Sparkles,
} from "lucide-react"

import { NovaMark } from "@/modules/nova-web/components/timeline"

/**
 * Dashboard surfaces that pair with Nova. Only pull-request / review deep links
 * stay here — settings, integrations, and account stay inside Nova itself.
 */
const LINKS = [
  {
    href: "/pulls",
    title: "Pull requests",
    description: "Review PRs inside Nova (Supercode Review)",
    icon: GitPullRequest,
    external: false,
  },
  {
    href: "/dashboard/pull-requests",
    title: "Pull requests (classic)",
    description: "Open the full dashboard PR workspace in a new tab",
    icon: Sparkles,
    external: true,
  },
  {
    href: "/dashboard/review-settings",
    title: "Review settings",
    description: "Tune Supercode Review rules, models, and publish behavior",
    icon: Shield,
    external: true,
  },
  {
    href: "/dashboard/bugs-caught",
    title: "Bugs caught",
    description: "Findings extracted from completed AI reviews",
    icon: Bug,
    external: true,
  },
  {
    href: "/dashboard",
    title: "Review overview",
    description: "Commits, PR volume, and connected repos at a glance",
    icon: Activity,
    external: true,
  },
] as const

export function MoreView() {
  return (
    <div className="h-full overflow-y-auto bg-[#0f0f0f]">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="flex items-center gap-3">
          <NovaMark />
          <div>
            <h1 className="text-[16px] font-medium text-[#e8e8e8]">More</h1>
            <p className="text-[12px] text-[#6b6b6b]">
              Review surfaces that pair with Nova. Settings and connections live in the sidebar.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-2">
          {LINKS.map((link) => {
            const Icon = link.icon
            return (
              <a
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 transition hover:border-white/[0.1] hover:bg-white/[0.04]"
              >
                <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-[#8a8a8a]">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[#e4e4e4]">{link.title}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-[#6b6b6b]">
                    {link.description}
                  </p>
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
