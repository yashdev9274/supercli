"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, Check, Copy } from "lucide-react"

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    el.style.opacity = "0"
    el.style.transform = "translateY(12px)"
    el.style.transition = "opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)"

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1"
          el.style.transform = "translateY(0)"
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

function FadeIn({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn()
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 hover:bg-white/10 active:scale-95"
      title={`Copy ${text}`}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  )
}

function ColorSwatch({
  name,
  hex,
  variable,
}: {
  name: string
  hex: string
  variable?: string
}) {
  return (
    <div className="group">
      <div className="relative rounded-xl overflow-hidden border border-border bg-card transition-all duration-500 ease-out hover:border-border/60">
        <div
          className="h-28 w-full transition-transform duration-500 ease-out group-hover:scale-105"
          style={{ backgroundColor: hex }}
        />
        <div className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">{name}</span>
            <CopyButton text={hex} />
          </div>
          <code className="text-xs text-muted-foreground font-mono">{hex}</code>
          {variable && (
            <div className="mt-1">
              <code className="text-[11px] text-muted-foreground/60 font-mono">
                {variable}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LogoCard({
  label,
  bgClass,
  children,
  downloads,
}: {
  label: string
  bgClass: string
  children: React.ReactNode
  downloads: { format: string; href: string }[]
}) {
  return (
    <div className="group relative rounded-xl overflow-hidden border border-border bg-card transition-all duration-500 ease-out hover:border-border/60">
      <div
        className={`relative flex h-48 w-full flex-col items-center justify-center overflow-hidden ${bgClass}`}
      >
        {children}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 translate-y-0 opacity-100 md:translate-y-4 md:opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
          {downloads.map((d) => (
            <a
              key={d.format}
              href={d.href}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center text-xs h-6 px-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 font-mono"
            >
              {d.format}
            </a>
          ))}
        </div>
      </div>
      <div className="px-4 py-3 border-t border-border">
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

function PixelWordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 840 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* S */}
      <rect x="8" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="16" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="24" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="32" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="8" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="8" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="16" y="24" width="8" height="8" fill="#f97316" />
      <rect x="24" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="32" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="8" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="16" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="24" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="32" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="8" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="16" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="24" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="32" y="48" width="8" height="8" fill="#fdba74" />

      {/* U */}
      <rect x="56" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="80" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="56" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="80" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="56" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="80" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="56" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="80" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="56" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="80" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="56" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="64" y="48" width="8" height="8" fill="#f97316" />
      <rect x="72" y="48" width="8" height="8" fill="#f97316" />
      <rect x="80" y="48" width="8" height="8" fill="#fdba74" />

      {/* P */}
      <rect x="104" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="112" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="120" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="128" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="104" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="128" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="104" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="128" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="104" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="112" y="32" width="8" height="8" fill="#f97316" />
      <rect x="120" y="32" width="8" height="8" fill="#f97316" />
      <rect x="104" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="104" y="48" width="8" height="8" fill="#fdba74" />

      {/* E */}
      <rect x="152" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="160" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="168" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="176" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="152" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="152" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="160" y="24" width="8" height="8" fill="#f97316" />
      <rect x="168" y="24" width="8" height="8" fill="#f97316" />
      <rect x="152" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="152" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="152" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="160" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="168" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="176" y="48" width="8" height="8" fill="#fdba74" />

      {/* R */}
      <rect x="200" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="208" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="216" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="224" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="200" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="224" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="200" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="224" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="200" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="208" y="32" width="8" height="8" fill="#f97316" />
      <rect x="216" y="32" width="8" height="8" fill="#f97316" />
      <rect x="224" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="200" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="216" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="224" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="200" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="208" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="216" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="224" y="48" width="8" height="8" fill="#fdba74" />

      {/* C */}
      <rect x="248" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="256" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="264" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="272" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="248" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="248" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="248" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="248" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="248" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="256" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="264" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="272" y="48" width="8" height="8" fill="#fdba74" />

      {/* O */}
      <rect x="296" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="304" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="312" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="320" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="296" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="320" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="296" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="320" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="296" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="320" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="296" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="320" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="296" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="304" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="312" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="320" y="48" width="8" height="8" fill="#fdba74" />

      {/* D */}
      <rect x="344" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="352" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="360" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="344" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="368" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="344" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="376" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="344" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="376" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="344" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="368" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="344" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="352" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="360" y="48" width="8" height="8" fill="#fdba74" />

      {/* E */}
      <rect x="400" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="408" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="416" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="424" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="400" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="400" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="408" y="24" width="8" height="8" fill="#f97316" />
      <rect x="416" y="24" width="8" height="8" fill="#f97316" />
      <rect x="400" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="400" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="400" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="408" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="416" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="424" y="48" width="8" height="8" fill="#fdba74" />

      {/* C */}
      <rect x="448" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="456" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="464" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="472" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="448" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="448" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="448" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="448" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="448" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="456" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="464" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="472" y="48" width="8" height="8" fill="#fdba74" />

      {/* O */}
      <rect x="496" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="504" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="512" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="520" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="496" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="520" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="496" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="520" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="496" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="520" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="496" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="520" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="496" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="504" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="512" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="520" y="48" width="8" height="8" fill="#fdba74" />

      {/* D */}
      <rect x="544" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="552" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="560" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="544" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="568" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="544" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="576" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="544" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="576" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="544" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="568" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="544" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="552" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="560" y="48" width="8" height="8" fill="#fdba74" />

      {/* E */}
      <rect x="600" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="608" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="616" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="624" y="8" width="8" height="8" fill="#fdba74" />
      <rect x="600" y="16" width="8" height="8" fill="#fb923c" />
      <rect x="600" y="24" width="8" height="8" fill="#fb923c" />
      <rect x="608" y="24" width="8" height="8" fill="#f97316" />
      <rect x="616" y="24" width="8" height="8" fill="#f97316" />
      <rect x="600" y="32" width="8" height="8" fill="#fb923c" />
      <rect x="600" y="40" width="8" height="8" fill="#fb923c" />
      <rect x="600" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="608" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="616" y="48" width="8" height="8" fill="#fdba74" />
      <rect x="624" y="48" width="8" height="8" fill="#fdba74" />
    </svg>
  )
}

function PixelGrayscaleWordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="0" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="3" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="6" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="0" y="3" width="3" height="3" fill="#71717a" />
      <rect x="0" y="6" width="3" height="3" fill="#71717a" />
      <rect x="3" y="6" width="3" height="3" fill="#71717a" />
      <rect x="6" y="6" width="3" height="3" fill="#71717a" />
      <rect x="6" y="9" width="3" height="3" fill="#52525b" />
      <rect x="0" y="12" width="3" height="3" fill="#52525b" />
      <rect x="3" y="12" width="3" height="3" fill="#52525b" />
      <rect x="6" y="12" width="3" height="3" fill="#52525b" />
      <rect x="12" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="18" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="12" y="3" width="3" height="3" fill="#71717a" />
      <rect x="18" y="3" width="3" height="3" fill="#71717a" />
      <rect x="12" y="6" width="3" height="3" fill="#71717a" />
      <rect x="18" y="6" width="3" height="3" fill="#71717a" />
      <rect x="12" y="9" width="3" height="3" fill="#52525b" />
      <rect x="18" y="9" width="3" height="3" fill="#52525b" />
      <rect x="12" y="12" width="3" height="3" fill="#52525b" />
      <rect x="15" y="12" width="3" height="3" fill="#52525b" />
      <rect x="18" y="12" width="3" height="3" fill="#52525b" />
      <rect x="24" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="27" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="30" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="24" y="3" width="3" height="3" fill="#71717a" />
      <rect x="30" y="3" width="3" height="3" fill="#71717a" />
      <rect x="24" y="6" width="3" height="3" fill="#71717a" />
      <rect x="27" y="6" width="3" height="3" fill="#71717a" />
      <rect x="30" y="6" width="3" height="3" fill="#71717a" />
      <rect x="24" y="9" width="3" height="3" fill="#52525b" />
      <rect x="24" y="12" width="3" height="3" fill="#52525b" />
      <rect x="36" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="39" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="42" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="36" y="3" width="3" height="3" fill="#71717a" />
      <rect x="36" y="6" width="3" height="3" fill="#71717a" />
      <rect x="39" y="6" width="3" height="3" fill="#71717a" />
      <rect x="42" y="6" width="3" height="3" fill="#71717a" />
      <rect x="36" y="9" width="3" height="3" fill="#52525b" />
      <rect x="36" y="12" width="3" height="3" fill="#52525b" />
      <rect x="39" y="12" width="3" height="3" fill="#52525b" />
      <rect x="42" y="12" width="3" height="3" fill="#52525b" />
      <rect x="48" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="51" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="54" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="48" y="3" width="3" height="3" fill="#71717a" />
      <rect x="54" y="3" width="3" height="3" fill="#71717a" />
      <rect x="48" y="6" width="3" height="3" fill="#71717a" />
      <rect x="51" y="6" width="3" height="3" fill="#71717a" />
      <rect x="54" y="6" width="3" height="3" fill="#71717a" />
      <rect x="48" y="9" width="3" height="3" fill="#52525b" />
      <rect x="51" y="9" width="3" height="3" fill="#52525b" />
      <rect x="48" y="12" width="3" height="3" fill="#52525b" />
      <rect x="54" y="12" width="3" height="3" fill="#52525b" />
      <rect x="62" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="65" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="68" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="62" y="3" width="3" height="3" fill="#71717a" />
      <rect x="62" y="6" width="3" height="3" fill="#71717a" />
      <rect x="62" y="9" width="3" height="3" fill="#52525b" />
      <rect x="62" y="12" width="3" height="3" fill="#52525b" />
      <rect x="65" y="12" width="3" height="3" fill="#52525b" />
      <rect x="68" y="12" width="3" height="3" fill="#52525b" />
      <rect x="74" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="77" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="80" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="74" y="3" width="3" height="3" fill="#71717a" />
      <rect x="80" y="3" width="3" height="3" fill="#71717a" />
      <rect x="74" y="6" width="3" height="3" fill="#71717a" />
      <rect x="80" y="6" width="3" height="3" fill="#71717a" />
      <rect x="74" y="9" width="3" height="3" fill="#52525b" />
      <rect x="80" y="9" width="3" height="3" fill="#52525b" />
      <rect x="74" y="12" width="3" height="3" fill="#52525b" />
      <rect x="77" y="12" width="3" height="3" fill="#52525b" />
      <rect x="80" y="12" width="3" height="3" fill="#52525b" />
      <rect x="86" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="89" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="92" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="86" y="3" width="3" height="3" fill="#71717a" />
      <rect x="92" y="3" width="3" height="3" fill="#71717a" />
      <rect x="86" y="6" width="3" height="3" fill="#71717a" />
      <rect x="92" y="6" width="3" height="3" fill="#71717a" />
      <rect x="86" y="9" width="3" height="3" fill="#52525b" />
      <rect x="92" y="9" width="3" height="3" fill="#52525b" />
      <rect x="86" y="12" width="3" height="3" fill="#52525b" />
      <rect x="89" y="12" width="3" height="3" fill="#52525b" />
      <rect x="98" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="101" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="104" y="0" width="3" height="3" fill="#a1a1aa" />
      <rect x="98" y="3" width="3" height="3" fill="#71717a" />
      <rect x="98" y="6" width="3" height="3" fill="#71717a" />
      <rect x="101" y="6" width="3" height="3" fill="#71717a" />
      <rect x="98" y="9" width="3" height="3" fill="#52525b" />
      <rect x="98" y="12" width="3" height="3" fill="#52525b" />
      <rect x="101" y="12" width="3" height="3" fill="#52525b" />
      <rect x="104" y="12" width="3" height="3" fill="#52525b" />
    </svg>
  )
}

function DownloadButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center text-xs h-6 px-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 font-mono"
    >
      {label}
    </button>
  )
}

function svgToPngDownload(svgElement: SVGSVGElement, filename: string) {
  const svgData = new XMLSerializer().serializeToString(svgElement)
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(svgBlob)

  const img = new window.Image()
  img.onload = () => {
    const canvas = document.createElement("canvas")
    const scale = 10
    canvas.width = img.naturalWidth * scale
    canvas.height = img.naturalHeight * scale
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          const a = document.createElement("a")
          a.href = URL.createObjectURL(blob)
          a.download = filename
          a.click()
          URL.revokeObjectURL(a.href)
        }
      }, "image/png")
    }
    URL.revokeObjectURL(url)
  }
  img.src = url
}

const colors = [
  {
    name: "Primary Orange",
    hex: "#F97316",
    variable: "var(--color-primary)",
  },
  { name: "Orange Light", hex: "#FB923C", variable: "CLI badge" },
  { name: "Orange Pale", hex: "#FDBA74", variable: "Logo highlight" },
  { name: "Email Orange", hex: "#E78A53", variable: "Email templates" },
  { name: "Background", hex: "#121113", variable: "var(--color-background)" },
  { name: "Card", hex: "#1A1B1E", variable: "var(--color-card)" },
  { name: "Border", hex: "#222222", variable: "var(--color-border)" },
  { name: "Muted", hex: "#71717A", variable: "var(--color-muted-foreground)" },
  { name: "Subtle", hex: "#A1A1AA", variable: "Logo grayscale" },
  { name: "Text", hex: "#E6EDF3", variable: "var(--color-foreground)" },
  { name: "Phosphor Green", hex: "#00FF88", variable: "CLI accent" },
  { name: "Dim Green", hex: "#1A4A36", variable: "CLI background" },
]

export default function BrandPageClient() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-24 pb-24">
      {/* Cover */}
      <div className="flex flex-col items-center mb-20">
        <div className="mb-8 mt-12 ml-5 opacity-90">
          <svg width="48" height="80" viewBox="0 0 9 15" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="3" height="3" fill="#a1a1aa" />
            <rect x="3" y="0" width="3" height="3" fill="#a1a1aa" />
            <rect x="6" y="0" width="3" height="3" fill="#a1a1aa" />
            <rect x="0" y="3" width="3" height="3" fill="#71717a" />
            <rect x="0" y="6" width="3" height="3" fill="#71717a" />
            <rect x="3" y="6" width="3" height="3" fill="#71717a" />
            <rect x="6" y="6" width="3" height="3" fill="#71717a" />
            <rect x="6" y="9" width="3" height="3" fill="#52525b" />
            <rect x="0" y="12" width="3" height="3" fill="#52525b" />
            <rect x="3" y="12" width="3" height="3" fill="#52525b" />
            <rect x="6" y="12" width="3" height="3" fill="#52525b" />
          </svg>
        </div>
        <h1 className="text-[2.5rem] md:text-[3.5rem] font-semibold tracking-tight leading-[100%] text-center mb-3">
          Brand guidelines
        </h1>
        <p className="text-base md:text-lg text-muted-foreground text-center max-w-lg">
          Guidelines and assets for presenting the Supercode brand consistently.
        </p>
      </div>

      {/* Naming */}
      <FadeIn>
        <section className="mb-16">
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-6">
            Naming
          </h2>
          <div className="space-y-3 text-sm text-foreground/80">
            <p>
              &quot;Supercode&quot; is the brand name and always spelled with a capital
              &quot;S&quot;.
            </p>
            <p>
              It is a single word and should not be spelled as &quot;SuperCode&quot;,
              &quot;supercode&quot;, &quot;Super Code&quot;, or any other variation.
            </p>
            <p>
              When referring to the CLI tool, use &quot;supercode-cli&quot; (all
              lowercase, with hyphen).
            </p>
          </div>
        </section>
      </FadeIn>

      <hr className="border-border mb-16" />

      {/* Logo */}
      <FadeIn>
        <section className="mb-16">
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-4">
            Logo
          </h2>
          <p className="text-sm text-foreground/80 mb-8">
            Use the Supercode pixel wordmark for stronger brand recognition. Do not
            alter these files in any way.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <LogoCard
              label="Pixel wordmark — amber"
              bgClass="bg-[#0A0A0A]"
              downloads={[]}
            >
              <PixelWordmark className="w-[200px] h-auto" />
            <div className="absolute bottom-3 right-3 flex items-center gap-2 translate-y-0 opacity-100 md:translate-y-4 md:opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              <a
                href="/brand/supercode-wordmark.svg"
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs h-6 px-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 font-mono"
              >
                .svg
              </a>
              <DownloadButton
                label=".png"
                onClick={() => {
                  const svg = document.querySelector<SVGSVGElement>(
                    '[data-wordmark="amber"]'
                  )
                  if (svg) svgToPngDownload(svg, "supercode-wordmark.png")
                }}
              />
            </div>
            <svg
              data-wordmark="amber"
              viewBox="0 0 840 80"
              width="840"
              height="80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="hidden"
            >
              <rect x="8" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="16" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="24" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="32" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="8" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="8" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="16" y="24" width="8" height="8" fill="#f97316" />
              <rect x="24" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="32" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="8" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="16" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="24" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="32" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="8" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="16" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="24" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="32" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="56" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="80" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="56" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="80" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="56" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="80" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="56" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="80" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="56" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="80" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="56" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="64" y="48" width="8" height="8" fill="#f97316" />
              <rect x="72" y="48" width="8" height="8" fill="#f97316" />
              <rect x="80" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="104" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="112" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="120" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="128" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="104" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="128" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="104" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="128" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="104" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="112" y="32" width="8" height="8" fill="#f97316" />
              <rect x="120" y="32" width="8" height="8" fill="#f97316" />
              <rect x="104" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="104" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="152" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="160" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="168" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="176" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="152" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="152" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="160" y="24" width="8" height="8" fill="#f97316" />
              <rect x="168" y="24" width="8" height="8" fill="#f97316" />
              <rect x="152" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="152" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="152" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="160" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="168" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="176" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="200" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="208" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="216" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="224" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="200" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="224" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="200" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="224" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="200" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="208" y="32" width="8" height="8" fill="#f97316" />
              <rect x="216" y="32" width="8" height="8" fill="#f97316" />
              <rect x="224" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="200" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="216" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="224" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="200" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="208" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="216" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="224" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="248" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="256" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="264" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="272" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="248" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="248" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="248" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="248" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="248" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="256" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="264" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="272" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="296" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="304" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="312" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="320" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="296" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="320" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="296" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="320" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="296" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="320" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="296" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="320" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="296" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="304" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="312" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="320" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="344" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="352" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="360" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="344" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="368" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="344" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="376" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="344" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="376" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="344" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="368" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="344" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="352" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="360" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="400" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="408" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="416" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="424" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="400" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="400" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="408" y="24" width="8" height="8" fill="#f97316" />
              <rect x="416" y="24" width="8" height="8" fill="#f97316" />
              <rect x="400" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="400" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="400" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="408" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="416" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="424" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="448" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="456" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="464" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="472" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="448" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="448" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="448" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="448" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="448" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="456" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="464" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="472" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="496" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="504" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="512" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="520" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="496" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="520" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="496" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="520" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="496" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="520" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="496" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="520" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="496" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="504" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="512" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="520" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="544" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="552" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="560" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="544" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="568" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="544" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="576" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="544" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="576" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="544" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="568" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="544" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="552" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="560" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="600" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="608" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="616" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="624" y="8" width="8" height="8" fill="#fdba74" />
              <rect x="600" y="16" width="8" height="8" fill="#fb923c" />
              <rect x="600" y="24" width="8" height="8" fill="#fb923c" />
              <rect x="608" y="24" width="8" height="8" fill="#f97316" />
              <rect x="616" y="24" width="8" height="8" fill="#f97316" />
              <rect x="600" y="32" width="8" height="8" fill="#fb923c" />
              <rect x="600" y="40" width="8" height="8" fill="#fb923c" />
              <rect x="600" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="608" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="616" y="48" width="8" height="8" fill="#fdba74" />
              <rect x="624" y="48" width="8" height="8" fill="#fdba74" />
            </svg>
          </LogoCard>

          <LogoCard
            label="Pixel wordmark — grayscale"
            bgClass="bg-[#0A0A0A]"
            downloads={[]}
          >
            <div className="opacity-60">
              <PixelGrayscaleWordmark className="w-[200px] h-auto" />
            </div>
            <div className="absolute bottom-3 right-3 flex items-center gap-2 translate-y-0 opacity-100 md:translate-y-4 md:opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              <a
                href="/brand/supercode-wordmark.svg"
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs h-6 px-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 font-mono"
              >
                .svg
              </a>
              <DownloadButton
                label=".png"
                onClick={() => {
                  const svg = document.querySelector<SVGSVGElement>(
                    '[data-wordmark="grayscale"]'
                  )
                  if (svg) svgToPngDownload(svg, "supercode-wordmark-grayscale.png")
                }}
              />
            </div>
            <svg
              data-wordmark="grayscale"
              viewBox="0 0 140 18"
              width="140"
              height="18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="hidden"
            >
              <rect x="0" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="3" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="6" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="0" y="3" width="3" height="3" fill="#71717a" />
              <rect x="0" y="6" width="3" height="3" fill="#71717a" />
              <rect x="3" y="6" width="3" height="3" fill="#71717a" />
              <rect x="6" y="6" width="3" height="3" fill="#71717a" />
              <rect x="6" y="9" width="3" height="3" fill="#52525b" />
              <rect x="0" y="12" width="3" height="3" fill="#52525b" />
              <rect x="3" y="12" width="3" height="3" fill="#52525b" />
              <rect x="6" y="12" width="3" height="3" fill="#52525b" />
              <rect x="12" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="18" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="12" y="3" width="3" height="3" fill="#71717a" />
              <rect x="18" y="3" width="3" height="3" fill="#71717a" />
              <rect x="12" y="6" width="3" height="3" fill="#71717a" />
              <rect x="18" y="6" width="3" height="3" fill="#71717a" />
              <rect x="12" y="9" width="3" height="3" fill="#52525b" />
              <rect x="18" y="9" width="3" height="3" fill="#52525b" />
              <rect x="12" y="12" width="3" height="3" fill="#52525b" />
              <rect x="15" y="12" width="3" height="3" fill="#52525b" />
              <rect x="18" y="12" width="3" height="3" fill="#52525b" />
              <rect x="24" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="27" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="30" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="24" y="3" width="3" height="3" fill="#71717a" />
              <rect x="30" y="3" width="3" height="3" fill="#71717a" />
              <rect x="24" y="6" width="3" height="3" fill="#71717a" />
              <rect x="27" y="6" width="3" height="3" fill="#71717a" />
              <rect x="30" y="6" width="3" height="3" fill="#71717a" />
              <rect x="24" y="9" width="3" height="3" fill="#52525b" />
              <rect x="24" y="12" width="3" height="3" fill="#52525b" />
              <rect x="36" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="39" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="42" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="36" y="3" width="3" height="3" fill="#71717a" />
              <rect x="36" y="6" width="3" height="3" fill="#71717a" />
              <rect x="39" y="6" width="3" height="3" fill="#71717a" />
              <rect x="42" y="6" width="3" height="3" fill="#71717a" />
              <rect x="36" y="9" width="3" height="3" fill="#52525b" />
              <rect x="36" y="12" width="3" height="3" fill="#52525b" />
              <rect x="39" y="12" width="3" height="3" fill="#52525b" />
              <rect x="42" y="12" width="3" height="3" fill="#52525b" />
              <rect x="48" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="51" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="54" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="48" y="3" width="3" height="3" fill="#71717a" />
              <rect x="54" y="3" width="3" height="3" fill="#71717a" />
              <rect x="48" y="6" width="3" height="3" fill="#71717a" />
              <rect x="51" y="6" width="3" height="3" fill="#71717a" />
              <rect x="54" y="6" width="3" height="3" fill="#71717a" />
              <rect x="48" y="9" width="3" height="3" fill="#52525b" />
              <rect x="51" y="9" width="3" height="3" fill="#52525b" />
              <rect x="48" y="12" width="3" height="3" fill="#52525b" />
              <rect x="54" y="12" width="3" height="3" fill="#52525b" />
              <rect x="62" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="65" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="68" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="62" y="3" width="3" height="3" fill="#71717a" />
              <rect x="62" y="6" width="3" height="3" fill="#71717a" />
              <rect x="62" y="9" width="3" height="3" fill="#52525b" />
              <rect x="62" y="12" width="3" height="3" fill="#52525b" />
              <rect x="65" y="12" width="3" height="3" fill="#52525b" />
              <rect x="68" y="12" width="3" height="3" fill="#52525b" />
              <rect x="74" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="77" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="80" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="74" y="3" width="3" height="3" fill="#71717a" />
              <rect x="80" y="3" width="3" height="3" fill="#71717a" />
              <rect x="74" y="6" width="3" height="3" fill="#71717a" />
              <rect x="80" y="6" width="3" height="3" fill="#71717a" />
              <rect x="74" y="9" width="3" height="3" fill="#52525b" />
              <rect x="80" y="9" width="3" height="3" fill="#52525b" />
              <rect x="74" y="12" width="3" height="3" fill="#52525b" />
              <rect x="77" y="12" width="3" height="3" fill="#52525b" />
              <rect x="80" y="12" width="3" height="3" fill="#52525b" />
              <rect x="86" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="89" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="92" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="86" y="3" width="3" height="3" fill="#71717a" />
              <rect x="92" y="3" width="3" height="3" fill="#71717a" />
              <rect x="86" y="6" width="3" height="3" fill="#71717a" />
              <rect x="92" y="6" width="3" height="3" fill="#71717a" />
              <rect x="86" y="9" width="3" height="3" fill="#52525b" />
              <rect x="92" y="9" width="3" height="3" fill="#52525b" />
              <rect x="86" y="12" width="3" height="3" fill="#52525b" />
              <rect x="89" y="12" width="3" height="3" fill="#52525b" />
              <rect x="98" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="101" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="104" y="0" width="3" height="3" fill="#a1a1aa" />
              <rect x="98" y="3" width="3" height="3" fill="#71717a" />
              <rect x="98" y="6" width="3" height="3" fill="#71717a" />
              <rect x="101" y="6" width="3" height="3" fill="#71717a" />
              <rect x="98" y="9" width="3" height="3" fill="#52525b" />
              <rect x="98" y="12" width="3" height="3" fill="#52525b" />
              <rect x="101" y="12" width="3" height="3" fill="#52525b" />
              <rect x="104" y="12" width="3" height="3" fill="#52525b" />
            </svg>
          </LogoCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LogoCard
            label="Logo mark — dark background"
            bgClass="bg-[#0A0A0A]"
            downloads={[]}
          >
            <Image
              src="/supercode-logo.png"
              alt="Supercode logo mark"
              width={120}
              height={120}
              className="w-24 h-24 object-contain"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2 translate-y-0 opacity-100 md:translate-y-4 md:opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              <a
                href="/supercode-logo.png"
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs h-6 px-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all duration-200 font-mono"
              >
                .png
              </a>
            </div>
          </LogoCard>

          <LogoCard
            label="Logo mark — light background"
            bgClass="bg-[#E8E8E8]"
            downloads={[]}
          >
            <Image
              src="/supercode-logo.png"
              alt="Supercode logo mark"
              width={120}
              height={120}
              className="w-24 h-24 object-contain"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2 translate-y-0 opacity-100 md:translate-y-4 md:opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              <a
                href="/supercode-logo.png"
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs h-6 px-2 rounded-lg bg-black/10 text-black/60 hover:bg-black/20 hover:text-black/80 transition-all duration-200 font-mono"
              >
                .png
              </a>
            </div>
          </LogoCard>
        </div>
      </section>
      </FadeIn>

      <hr className="border-border mb-16" />

      {/* Colors */}
      <FadeIn>
        <section className="mb-16">
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-4">
            Colors
          </h2>
        <p className="text-sm text-foreground/80 mb-8">
          Click any hex value to copy. Our palette is built on warm amber/orange
          tones with a deep dark foundation.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {colors.map((c) => (
            <ColorSwatch key={c.hex + c.name} {...c} />
          ))}
        </div>
        </section>
      </FadeIn>

      <hr className="border-border mb-16" />

      {/* Typography */}
      <FadeIn>
        <section className="mb-16">
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-4">
            Typography
          </h2>
        <p className="text-sm text-foreground/80 mb-8">
          Supercode uses a monospace-forward type system. Code is king.
        </p>

        <div className="space-y-8">
          <div className="rounded-xl border border-border bg-card p-6">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-4 block">
              Primary — JetBrains Mono
            </span>
            <p
              className="text-2xl md:text-3xl font-medium tracking-tight mb-2"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Supercode builds software at the speed of thought.
            </p>
            <p
              className="text-sm text-muted-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
              0123456789 !@#$%^&amp;*()
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-4 block">
              Secondary — Inter
            </span>
            <p className="text-2xl md:text-3xl font-medium tracking-tight mb-2">
              Supercode builds software at the speed of thought.
            </p>
            <p className="text-sm text-muted-foreground">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz
              0123456789 !@#$%^&amp;*()
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-4 block">
              Type scale
            </span>
            <div className="space-y-4">
              {[
                { size: "text-[36px]", label: "36px / Bold", weight: "font-bold" },
                { size: "text-[28px]", label: "28px / Semibold", weight: "font-semibold" },
                { size: "text-[20px]", label: "20px / Medium", weight: "font-medium" },
                { size: "text-[16px]", label: "16px / Regular", weight: "font-normal" },
                { size: "text-[14px]", label: "14px / Regular", weight: "font-normal" },
                { size: "text-[12px]", label: "12px / Regular", weight: "font-normal" },
              ].map((t) => (
                <div key={t.label} className="flex items-baseline gap-4">
                  <span
                    className={`${t.size} ${t.weight} shrink-0`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Aa
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </section>
      </FadeIn>

      <hr className="border-border mb-16" />

      {/* Product Screenshots */}
      <FadeIn>
        <section className="mb-16">
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-4">
            Product
          </h2>
        <p className="text-sm text-foreground/80 mb-8">
          Use the following product screenshots when presenting Supercode to
          avoid showing any sensitive information.
        </p>

        <div className="group relative rounded-xl overflow-hidden border border-border bg-card transition-all duration-500 ease-out hover:border-border/60">
          <div className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/og-image2.png"
              alt="Supercode product screenshot"
              className="w-full h-auto rounded-lg transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          </div>
          <div className="px-4 pb-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              supercli.vercel.app
            </span>
            <a
              href="/og-image2.png"
              download
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Download
              <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
        </section>
      </FadeIn>

      <hr className="border-border mb-16" />

      {/* Usage Rules */}
      <FadeIn>
        <section className="mb-16">
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-4">
            Usage rules
          </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <span className="text-xs text-green-400 font-mono uppercase tracking-wider mb-4 block">
              Do
            </span>
            <ul className="space-y-2 text-sm text-foreground/80">
              <li>• Use the pixel wordmark on dark backgrounds</li>
              <li>• Maintain clear space around the logo</li>
              <li>• Use the amber/orange palette for brand materials</li>
              <li>• Use JetBrains Mono for code and terminal contexts</li>
              <li>• Keep the logo at a legible size</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <span className="text-xs text-red-400 font-mono uppercase tracking-wider mb-4 block">
              Don&apos;t
            </span>
            <ul className="space-y-2 text-sm text-foreground/80">
              <li>• Stretch or distort the logo</li>
              <li>• Change the logo colors</li>
              <li>• Place the logo on busy backgrounds</li>
              <li>• Use the logo as a pattern or texture</li>
              <li>• Add effects like shadows or gradients to the logo</li>
            </ul>
          </div>
        </div>
        </section>
      </FadeIn>

      <hr className="border-border mb-16" />

      {/* Contact */}
      <FadeIn>
        <section>
          <h2 className="text-[28px] leading-[34px] tracking-tight font-semibold mb-4">
            Questions
          </h2>
        <p className="text-sm text-foreground/80">
          Please{" "}
          <Link
            href="/contact"
            className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
          >
            contact us
          </Link>{" "}
          if you need additional assets or have questions on how to use the
          Supercode brand.
        </p>
      </section>
      </FadeIn>
    </div>
  )
}
