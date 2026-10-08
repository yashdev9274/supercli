"use client"

import { useEffect, useRef, useState } from "react"
import {
  Activity,
  ChevronUp,
  CreditCard,
  HelpCircle,
  LogOut,
  Settings2,
  UserRound,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { signOut } from "@/lib/auth-client"
import type { NovaUser } from "@/modules/nova-web/types"

export function AccountMenu({
  user,
  onNavigate,
  align = "left",
  className,
}: {
  user: NovaUser
  onNavigate: (href: string) => void
  align?: "left" | "right"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOut()
      window.location.href = "/login"
    } catch {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/[0.04]"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-7 rounded-full object-cover" />
        ) : (
          <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[#2dd4bf] to-[#0f766e] text-[10px] font-semibold text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[#c8c8c8]">{user.name}</p>
          <p className="truncate text-[11px] text-[#5c5c5c]">Your workspace</p>
        </div>
        <ChevronUp className={cn("size-3.5 text-[#3d3d3d] transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute bottom-[calc(100%+8px)] z-50 w-[240px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#1a1a1a] py-1 shadow-2xl",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          <MenuRow
            icon={<Settings2 className="size-3.5" />}
            label="Settings"
            hint="⌘,"
            onClick={() => {
              setOpen(false)
              onNavigate("/settings")
            }}
          />
          <MenuRow
            icon={<UserRound className="size-3.5" />}
            label="Profile"
            onClick={() => {
              setOpen(false)
              onNavigate("/settings?section=profile")
            }}
          />
          <MenuRow
            icon={<Activity className="size-3.5" />}
            label="Activity"
            onClick={() => {
              setOpen(false)
              onNavigate("/settings?section=activity")
            }}
          />
          <MenuRow
            icon={<CreditCard className="size-3.5" />}
            label="Usage"
            onClick={() => {
              setOpen(false)
              onNavigate("/settings?section=usage")
            }}
          />
          <MenuRow
            icon={<HelpCircle className="size-3.5" />}
            label="Support"
            onClick={() => {
              setOpen(false)
              window.open("https://supercode.ai", "_blank", "noopener,noreferrer")
            }}
          />
          <div className="my-1 border-t border-white/[0.06]" />
          <MenuRow
            icon={<LogOut className="size-3.5" />}
            label={busy ? "Signing out…" : "Log out"}
            danger
            onClick={() => void handleSignOut()}
          />
        </div>
      ) : null}
    </div>
  )
}

function MenuRow({
  icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 px-2.5 text-left text-[13px] transition hover:bg-white/[0.05]",
        danger ? "text-red-400" : "text-[#c8c8c8]",
      )}
    >
      <span className="opacity-80">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint ? <span className="font-mono text-[10px] text-[#4a4a4a]">{hint}</span> : null}
    </button>
  )
}
