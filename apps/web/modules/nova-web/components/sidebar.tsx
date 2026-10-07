"use client"

import { useMemo, useState } from "react"
import {
  GitPullRequest,
  Link2,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { statusDot } from "@/modules/nova-web/theme"
import { AccountMenu } from "@/modules/nova-web/components/account-menu"
import {
  relativeTime,
  sessionUiStatus,
  type AgentSessionSummary,
  type NovaUser,
  type WorkspaceView,
} from "@/modules/nova-web/types"

export function NovaSidebar({
  user,
  sessions,
  selectedId,
  selectedPullId,
  view,
  query,
  pendingApprovals,
  onQueryChange,
  onNavigate,
  onNewSession,
  onClose,
}: {
  user: NovaUser
  sessions: AgentSessionSummary[]
  selectedId: string | null
  selectedPullId?: string | null
  view: WorkspaceView
  query: string
  pendingApprovals: number
  onQueryChange: (value: string) => void
  onNavigate: (href: string) => void
  onNewSession: () => void
  onClose?: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  const filtered = useMemo(
    () =>
      sessions.filter((item) =>
        item.objective.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, sessions],
  )

  const threadsActive = view === "home" || view === "session"
  const pullsActive = view === "pulls" || view === "pull"

  return (
    <aside className="flex h-full w-[244px] shrink-0 flex-col bg-[#0c0c0c] text-[#e8e8e8]">
      <div className="flex h-11 items-center gap-1 px-2.5">
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] transition hover:bg-white/[0.07]"
          aria-label="Nova home"
        >
          <Sparkles className="size-3.5 text-[#2dd4bf]" strokeWidth={2} />
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn
            label="Search threads"
            onClick={() => setSearchOpen((value) => !value)}
          >
            <Search className="size-3.5" />
          </IconBtn>
          <IconBtn label={onClose ? "Close" : "Collapse"} onClick={onClose}>
            <PanelLeft className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition",
            view === "home"
              ? "bg-white/[0.08] text-white"
              : "text-[#c4c4c4] hover:bg-white/[0.04] hover:text-white",
          )}
        >
          <Pencil className="size-3.5 opacity-80" strokeWidth={1.75} />
          New thread
        </button>

        <NavItem
          active={threadsActive}
          icon={<MessageSquare className="size-3.5" strokeWidth={1.75} />}
          label="Threads"
          onClick={() => onNavigate("/")}
        />
        <NavItem
          active={view === "approvals"}
          icon={<ShieldCheck className="size-3.5" strokeWidth={1.75} />}
          label="Approvals"
          badge={pendingApprovals > 0 ? pendingApprovals : undefined}
          onClick={() => onNavigate("/approvals")}
        />
        <NavItem
          active={pullsActive}
          icon={<GitPullRequest className="size-3.5" strokeWidth={1.75} />}
          label="Pull requests"
          onClick={() => onNavigate("/pulls")}
        />
        <NavItem
          active={view === "connections"}
          icon={<Link2 className="size-3.5" strokeWidth={1.75} />}
          label="Connections"
          onClick={() => onNavigate("/connections")}
        />
        <NavItem
          active={view === "more"}
          icon={<MoreHorizontal className="size-3.5" strokeWidth={1.75} />}
          label="More"
          onClick={() => onNavigate("/more")}
        />
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col border-t border-white/[0.04] pt-2">
        <div className="flex items-center px-3 pb-1.5">
          <span className="text-[11px] font-medium text-[#5c5c5c]">
            {pullsActive ? "Review" : "Threads"}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn
              label="Search"
              size="sm"
              onClick={() => setSearchOpen((value) => !value)}
            >
              <Search className="size-3" />
            </IconBtn>
            <IconBtn
              label="Settings"
              size="sm"
              onClick={() => onNavigate("/more")}
            >
              <Settings2 className="size-3" />
            </IconBtn>
          </div>
        </div>

        {(searchOpen || query) && (
          <div className="px-2 pb-1.5">
            <div className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[#5c5c5c] focus-within:text-[#a0a0a0]">
              <Search className="size-3 shrink-0" />
              <input
                autoFocus={searchOpen}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search threads"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[#c4c4c4] outline-none placeholder:text-[#3d3d3d]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="text-[#5c5c5c] hover:text-[#a0a0a0]"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {pullsActive ? (
            <div className="space-y-0.5 px-1 py-2">
              <button
                type="button"
                onClick={() => onNavigate("/pulls")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] transition",
                  view === "pulls" && !selectedPullId
                    ? "bg-white/[0.07] text-white"
                    : "text-[#a0a0a0] hover:bg-white/[0.035]",
                )}
              >
                <GitPullRequest className="size-3.5" />
                All pull requests
              </button>
              <p className="px-2 pt-3 text-[10px] uppercase tracking-[0.08em] text-[#3d3d3d]">
                Supercode Review
              </p>
              <p className="px-2 pt-1 text-[11px] leading-4 text-[#5c5c5c]">
                Open a PR to run AI review, inspect diffs, and publish findings.
              </p>
            </div>
          ) : (
            <>
              {filtered.map((item, index) => {
                const ui = sessionUiStatus(item)
                const selected = selectedId === item.id && view === "session"
                const code = `NOVA-${Math.max(1, sessions.length - index)}`
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(`/s/${item.id}`)}
                    className={cn(
                      "group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition",
                      selected ? "bg-white/[0.07]" : "hover:bg-white/[0.035]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-[7px] size-1.5 shrink-0 rounded-full",
                        statusDot[ui] ?? statusDot[item.status] ?? "bg-zinc-600",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[#c8c8c8]">
                          {item.objective}
                        </p>
                        <span className="shrink-0 pt-0.5 font-mono text-[10px] text-[#3d3d3d]">
                          {relativeTime(item.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[#3d3d3d]">
                        {code}
                      </p>
                    </div>
                  </button>
                )
              })}
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-[#3d3d3d]">
                  No threads
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="border-t border-white/[0.04] p-2">
        <AccountMenu user={user} onNavigate={onNavigate} />
      </div>
    </aside>
  )
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition",
        active
          ? "bg-white/[0.06] text-white"
          : "text-[#a0a0a0] hover:bg-white/[0.04] hover:text-[#e8e8e8]",
      )}
    >
      <span className="opacity-80">{icon}</span>
      {label}
      {badge != null ? (
        <span className="ml-auto rounded-full bg-[#2dd4bf] px-1.5 py-0.5 text-[10px] font-semibold text-black">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  size = "md",
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  size?: "sm" | "md"
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-md text-[#5c5c5c] transition hover:bg-white/[0.05] hover:text-[#a0a0a0]",
        size === "sm" ? "size-6" : "size-7",
      )}
    >
      {children}
    </button>
  )
}
