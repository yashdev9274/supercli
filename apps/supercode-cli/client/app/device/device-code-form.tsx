"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Terminal, ArrowRight, KeyRound } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Spinner } from "@/components/ui/spinner"
import { PixelLogo } from "@/components/ui/pixel-logo"

const DeviceCodeForm = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [userCode, setUserCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 80)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const codeFromUrl = searchParams.get("user_code")
    if (codeFromUrl) {
      const formatted = formatCode(codeFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, ""))
      setUserCode(formatted)
    }
  }, [searchParams])

  const formatCode = (raw: string) => {
    if (raw.length > 4) {
      return raw.slice(0, 4) + "-" + raw.slice(4, 8)
    }
    return raw
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    value = formatCode(value)
    setUserCode(value)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase()
      const response = await authClient.device({
        query: { user_code: formattedCode },
      })

      if (response.data) {
        router.push(`/approve?user_code=${formattedCode}`)
      } else if (response.error) {
        const msg =
          (response.error as { error_description?: string }).error_description ||
          (response.error as { error?: string }).error ||
          "verification failed"
        setError(msg)
      }
    } catch {
      setError("invalid or expired code")
    } finally {
      setIsLoading(false)
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
        className="relative z-10 w-full max-w-md"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 500ms cubic-bezier(0.23, 1, 0.32, 1), transform 500ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
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
            <p className="text-zinc-500 text-sm font-mono text-center max-w-xs leading-relaxed">
              Enter the device code shown in your terminal to authorize this session
            </p>
          </div>

          {/* Code input card */}
          <div
            className="w-full border border-zinc-800 rounded-xl bg-zinc-900/60 backdrop-blur-sm overflow-hidden"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 400ms cubic-bezier(0.23, 1, 0.32, 1) 200ms, transform 400ms cubic-bezier(0.23, 1, 0.32, 1) 200ms",
            }}
          >
            {/* Terminal title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/80">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-zinc-700" />
                <div className="size-2.5 rounded-full bg-zinc-700" />
                <div className="size-2.5 rounded-full bg-zinc-700" />
              </div>
              <span className="text-[11px] text-zinc-600 font-mono ml-2">device-auth.sh</span>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Prompt line */}
              <div className="flex items-start gap-3">
                <span className="text-amber-400 font-mono text-sm mt-0.5 shrink-0">$</span>
                <div>
                  <p className="text-zinc-100 font-mono text-sm font-medium">
                    link --code
                  </p>
                  <p className="text-zinc-500 text-xs font-mono mt-1">
                    Paste the authorization code from your device
                  </p>
                </div>
              </div>

              {/* Code input */}
              <div>
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-950 rounded-lg border border-zinc-800 mb-px">
                  <span className="text-[11px] text-zinc-600 font-mono uppercase tracking-wider">
                    Device Code
                  </span>
                  <KeyRound className="size-3 text-zinc-700" />
                </div>
                <input
                  id="code"
                  type="text"
                  value={userCode}
                  onChange={handleCodeChange}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  autoComplete="off"
                  spellCheck={false}
                  className="
                    w-full px-4 py-4
                    bg-zinc-950/80
                    border border-zinc-800/80
                    rounded-lg
                    text-zinc-100 font-mono text-xl text-center tracking-[0.15em]
                    placeholder:text-zinc-700
                    focus:outline-none
                    transition-all duration-200 ease-out
                    focus:border-amber-500/40 focus:shadow-[0_0_0_1px_oklch(0.72_0.14_48.5/0.15),0_0_20px_oklch(0.72_0.14_48.5/0.06)]
                    caret-amber-400
                  "
                />
                <p className="text-[11px] text-zinc-700 font-mono mt-2 flex items-center gap-1.5">
                  <span className="size-1 rounded-full bg-zinc-700" />
                  {userCode.length === 9
                    ? "press enter to continue"
                    : `${userCode.length}/9 characters`}
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="px-3 py-2.5 bg-red-950/30 border border-red-900/30 rounded-lg">
                  <p className="text-xs font-mono text-red-400/90">! {error}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading || userCode.length < 9}
                className="
                  w-full h-11 rounded-lg font-mono text-sm font-medium
                  bg-amber-600/90 text-zinc-950
                  hover:bg-amber-500
                  active:bg-amber-400
                  disabled:opacity-30 disabled:cursor-not-allowed
                  transition-all duration-[160ms] ease-out
                  active:scale-[0.98]
                  flex items-center justify-center gap-2
                "
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Spinner className="size-4" />
                    verifying...
                  </span>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>

              {/* Security note */}
              <div className="px-3 py-2.5 bg-zinc-950/30 rounded-lg border border-zinc-800/30">
                <p className="text-[11px] text-zinc-600 font-mono leading-relaxed">
                  This code is unique to your device and will expire shortly.
                  Keep it confidential and never share it with anyone.
                </p>
              </div>
            </form>

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-900/80">
              <span className="text-[11px] text-zinc-600 font-mono flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-zinc-700" />
                awaiting input
              </span>
              <span className="text-[11px] text-zinc-700 font-mono">
                guest$
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

export default DeviceCodeForm
