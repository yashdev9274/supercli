"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Terminal, Shield, Check, X } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Spinner } from "@/components/ui/spinner"
import { PixelLogo } from "@/components/ui/pixel-logo"
import { toast } from "sonner"

const DeviceApprovalPage = () => {
  const { data, isPending } = authClient.useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const userCode = searchParams.get("user_code")

  const [isProcessing, setIsProcessing] = useState({
    approve: false,
    deny: false,
  })
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 80)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (isPending) return
    if (!data?.session && !data?.user) {
      const returnUrl = userCode ? `/approve?user_code=${userCode}` : "/approve"
      router.replace(`/sign-in?redirect=${encodeURIComponent(returnUrl)}`)
    }
  }, [isPending, data, userCode, router])

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Spinner className="size-6 text-amber-500" />
      </div>
    )
  }

  if (!data?.session && !data?.user) {
    return null
  }

  const handleApprove = async () => {
    setIsProcessing({ approve: true, deny: false })
    try {
      toast.loading("Approving device...", { id: "approve" })
      await authClient.device.approve({ userCode: userCode! })
      toast.dismiss("approve")
      toast.success("Device approved successfully")
      router.push("/")
    } catch {
      toast.error("Failed to approve device. Please try again.")
    } finally {
      setIsProcessing({ approve: false, deny: false })
    }
  }

  const handleDeny = async () => {
    setIsProcessing({ approve: false, deny: true })
    try {
      toast.loading("Denying device...", { id: "deny" })
      await authClient.device.deny({ userCode: userCode! })
      toast.dismiss("deny")
      toast.success("Device request denied")
      router.push("/")
    } catch {
      toast.error("Failed to deny device. Please try again.")
    } finally {
      setIsProcessing({ approve: false, deny: false })
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-zinc-950 p-4 overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 50% 0%, oklch(0.7 0.14 48.5 / 0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, oklch(0.6 0.15 145 / 0.05) 0%, transparent 50%),
            oklch(0.12 0.01 280)
          `,
        }}
      />

      <div
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 500ms cubic-bezier(0.23, 1, 0.32, 1), transform 500ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="flex flex-col items-center gap-8">
          {/* Terminal header */}
          <div
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(-8px)",
              transition: "opacity 400ms cubic-bezier(0.23, 1, 0.32, 1) 80ms, transform 400ms cubic-bezier(0.23, 1, 0.32, 1) 80ms",
            }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-2 text-zinc-600 text-xs font-mono">
              <Terminal className="size-3" />
              <span>supercode auth --device</span>
            </div>
            <PixelLogo />
          </div>

          {/* Device info card */}
          <div
            className="w-full border border-zinc-800 rounded-xl bg-zinc-900/60 backdrop-blur-sm overflow-hidden"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 400ms cubic-bezier(0.23, 1, 0.32, 1) 160ms, transform 400ms cubic-bezier(0.23, 1, 0.32, 1) 160ms",
            }}
          >
            {/* Terminal title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-zinc-700" />
                <div className="size-2.5 rounded-full bg-zinc-700" />
                <div className="size-2.5 rounded-full bg-zinc-700" />
              </div>
              <span className="text-[11px] text-zinc-600 font-mono ml-2">device-approval.sh</span>
            </div>

            <div className="p-6 space-y-6">
              {/* Prompt line */}
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 font-mono text-sm mt-0.5 shrink-0">$</span>
                <div>
                  <p className="text-zinc-100 font-mono text-sm font-medium">
                    authorize --device
                  </p>
                  <p className="text-zinc-500 text-xs font-mono mt-1">
                    A new device is requesting access to your account
                  </p>
                </div>
              </div>

              {/* Code display */}
              <div className="relative">
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 rounded-lg border border-zinc-800">
                  <span className="text-[11px] text-zinc-600 font-mono uppercase tracking-wider">
                    Authorization Code
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-amber-500/60 animate-pulse" />
                    <span className="text-[11px] text-zinc-600 font-mono">live</span>
                  </div>
                </div>
                <div className="mt-px px-4 py-4 bg-zinc-950/80 rounded-lg border border-zinc-800/80">
                  <p
                    className="text-2xl font-mono font-bold text-amber-400 text-center tracking-[0.15em] select-all"
                    style={{
                      animation: "code-reveal 500ms cubic-bezier(0.23, 1, 0.32, 1) 300ms both",
                    }}
                  >
                    {userCode || "---"}
                  </p>
                </div>
                <p className="text-[11px] text-zinc-700 font-mono text-center mt-2">
                  Share this code with the requesting device
                </p>
              </div>

              {/* Account info */}
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                <Shield className="size-3 text-zinc-600 shrink-0" />
                <span className="text-xs font-mono text-zinc-500 truncate">
                  {data?.user?.email}
                </span>
              </div>

              {/* Security notice */}
              <div className="px-3 py-2.5 bg-zinc-950/30 rounded-lg border border-zinc-800/30">
                <p className="text-[11px] text-zinc-600 font-mono leading-relaxed">
                  Only approve this request if you initiated it. Never share
                  authorization codes with others.
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-2.5">
                <button
                  onClick={handleApprove}
                  disabled={isProcessing.approve || isProcessing.deny}
                  className="
                    w-full h-11 rounded-lg font-mono text-sm font-medium
                    bg-emerald-600 text-zinc-950
                    hover:bg-emerald-500
                    active:bg-emerald-400
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-all duration-[160ms] ease-out
                    active:scale-[0.98]
                    flex items-center justify-center gap-2
                  "
                >
                  {isProcessing.approve ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="size-4" />
                      approving...
                    </span>
                  ) : (
                    <>
                      <Check className="size-4" />
                      <span>Approve Device</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDeny}
                  disabled={isProcessing.deny || isProcessing.approve}
                  className="
                    w-full h-11 rounded-lg font-mono text-sm font-medium
                    border border-zinc-800 text-zinc-400
                    hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/30
                    active:bg-zinc-800/50
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-all duration-[160ms] ease-out
                    active:scale-[0.98]
                    flex items-center justify-center gap-2
                  "
                >
                  {isProcessing.deny ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="size-4" />
                      denying...
                    </span>
                  ) : (
                    <>
                      <X className="size-4" />
                      <span>Deny Device</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-900/80">
              <span className="text-[11px] text-zinc-600 font-mono flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500/60" />
                session active
              </span>
              <span className="text-[11px] text-zinc-700 font-mono">
                {data?.user?.email ? `${data.user.email?.split("@")[0]}$` : "guest$"}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center gap-2 text-[11px] text-zinc-700 font-mono"
            style={{
              opacity: isVisible ? 1 : 0,
              transition: "opacity 400ms ease-out 500ms",
            }}
          >
            <span>built with</span>
            <span className="text-zinc-600">bun · typescript · better-auth</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DeviceApprovalPage
