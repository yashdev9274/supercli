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
    <div className="h-full overflow-y-auto bg-[#0e0e10]">
      <div className="mx-auto max-w-[840px] px-5 py-10 sm:px-10 sm:py-14">
        <div className="flex items-center gap-3">
          <NovaMark />
          <div>
            <h1 className="text-[22px] font-medium tracking-[-0.025em] text-[#e8e8e8]">More</h1>
            <p className="text-[12px] text-[#85858e]">
              Review surfaces that pair with Nova. Settings and connections live in the sidebar.
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-white/[0.08] bg-[#151517]">
          {LINKS.map((link) => {
            const Icon = link.icon
            return (
              <a
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="flex items-start gap-3 border-b border-white/[0.06] px-4 py-4 transition last:border-b-0 hover:bg-white/[0.04]"
              >
                <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-[#8a8a8a]">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[#e4e4e4]">{link.title}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-[#85858e]">
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
