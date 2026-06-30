"use client"

import { useState, useEffect, useCallback } from "react"

type Time = {
  hours: number
  minutes: number
  seconds: number
  total: number
}

function getTimeRemaining(target: number): Time {
  const diff = Math.max(0, target - Date.now())
  return {
    total: diff,
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  }
}

function isExpired(target: number): boolean {
  return Date.now() >= target
}

export default function BetaCountdownBanner({
  onVisibilityChange,
}: {
  onVisibilityChange?: (visible: boolean) => void
}) {
  const [visible, setVisible] = useState(false)
  const [targetTime, setTargetTime] = useState<number | null>(null)
  const [time, setTime] = useState<Time>({ total: 48 * 60 * 60 * 1000, hours: 48, minutes: 0, seconds: 0 })
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    // July 10, 2026 — Product Hunt launch
    const target = new Date("2026-07-10T00:00:00").getTime()

    if (isExpired(target)) {
      setExpired(true)
      return
    }

    setTargetTime(target)
    setTime(getTimeRemaining(target))
    setVisible(true)
  }, [])

  useEffect(() => {
    if (!targetTime || expired) return
    const interval = setInterval(() => {
      const remaining = getTimeRemaining(targetTime)
      setTime(remaining)
      if (remaining.total <= 0) {
        setExpired(true)
        setVisible(false)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [targetTime, expired])

  useEffect(() => {
    onVisibilityChange?.(visible)
  }, [visible, onVisibilityChange])

  const handleDismiss = useCallback(() => {
    setVisible(false)
  }, [])

  if (!visible) return null

  const pad = (n: number) => n.toString().padStart(2, "0")

  return (
    <div className="h-[44px] sm:h-[40px] bg-[#0a0a0a] border-b border-primary/15 overflow-hidden">
      {/* Animated scan-line texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255, 255, 255, 0.02) 1px, rgba(255, 255, 255, 0.02) 2px)",
          backgroundSize: "100% 2px",
        }}
      />

      {/* Subtle amber gradient glow at the very bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="relative h-full max-w-[1400px] mx-auto flex items-center justify-center sm:justify-between px-3 sm:px-5 md:px-12 gap-2">
        {/* Left: Beta indicator */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-[10px] sm:text-[11px] font-mono text-primary font-semibold tracking-[0.15em] uppercase">
            <span className="sm:hidden">Beta</span>
            <span className="hidden sm:inline">Beta Live</span>
          </span>
          <span className="text-[#222] text-[12px] sm:text-[14px] font-light select-none">|</span>
          <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/60 uppercase tracking-[0.1em] sm:tracking-[0.12em]">
            T-MINUS
          </span>
          <span className="text-[9px] sm:text-[10px] font-mono text-muted-foreground/40 uppercase tracking-[0.08em] ml-1 hidden md:inline">
            jul 10
          </span>
        </div>

        {/* Center: Countdown */}
        <div
          className="flex items-baseline gap-1 sm:gap-1.5 select-none"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          <DigitPairMobile value={pad(time.hours)} />
          <span className="text-primary/50 text-[12px] sm:text-[14px] font-light leading-none -mt-[1px] sm:-mt-[2px] animate-pulse">
            :
          </span>
          <DigitPairMobile value={pad(time.minutes)} />
          <span className="text-primary/50 text-[12px] sm:text-[14px] font-light leading-none -mt-[1px] sm:-mt-[2px] animate-pulse">
            :
          </span>
          <DigitPairMobile value={pad(time.seconds)} />
          <span className="text-[8px] sm:text-[9px] font-mono text-muted-foreground/30 uppercase tracking-[0.1em] ml-0.5 sm:ml-1 hidden sm:inline">
            remain
          </span>
        </div>

        {/* Right: CTA + Dismiss */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <a
            href="/launch"
            className="text-[10px] sm:text-[11px] font-mono text-primary/70 hover:text-primary transition-colors duration-200 underline underline-offset-2 decoration-primary/20 hover:decoration-primary/50"
          >
            <span className="sm:hidden">→</span>
            <span className="hidden sm:inline">join waitlist →</span>
          </a>
          <button
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground/25 hover:text-foreground/60 transition-colors duration-200 p-1 rounded hover:bg-white/5"
          aria-label="Dismiss banner"
        >
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" className="sm:w-[13px] sm:h-[13px]">
            <path
              d="M1.5 1.5L11.5 11.5M11.5 1.5L1.5 11.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      </div>
    </div>
  )
}

function DigitPairMobile({ value }: { value: string }) {
  return (
    <div className="flex gap-[1.5px]">
      {value.split("").map((digit, i) => (
        <span
          key={i}
          className="w-[12px] sm:w-[15px] text-center text-[14px] sm:text-[17px] font-mono font-bold text-primary leading-none"
          style={{ textShadow: "0 0 8px rgba(217,157,50,0.15)" }}
        >
          {digit}
        </span>
      ))}
    </div>
  )
}
