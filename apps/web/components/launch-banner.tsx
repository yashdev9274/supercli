"use client"

import Link from "next/link"

export default function LaunchBanner() {
  return (
    <div className="sticky top-0 z-[10000] h-9 sm:h-10 bg-[#0a0a0a] border-b border-primary/15">
      <Link
        href="/launch"
        className="h-full w-full flex items-center justify-center gap-2 sm:gap-3 px-4 hover:bg-white/[0.02] transition-colors duration-200"
      >
        <span className="relative flex items-center justify-center h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
        </span>
        <span className="text-[10px] sm:text-[11px] font-mono text-primary font-semibold leading-none">
          <span className="sm:hidden">Beta Live</span>
          <span className="hidden sm:inline">beta live on Product Hunt</span>
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 leading-none">
          <span className="text-[10px] sm:text-[11px] text-muted-foreground/50 select-none font-mono leading-none">·</span>
          <span className="text-[10px] sm:text-[11px] font-mono text-muted-foreground/60 leading-none">
            learn more →
          </span>
        </span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          className="sm:hidden text-primary/50 shrink-0"
        >
          <path
            d="M2.5 9.5L9.5 2.5M9.5 2.5H3.5M9.5 2.5V8.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </div>
  )
}
