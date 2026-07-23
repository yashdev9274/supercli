"use client"

import { useRef, useState } from "react"

export function TerminalBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const codeRef = useRef<HTMLDivElement>(null)

  const handleCopy = async () => {
    const text = codeRef.current?.textContent || ""
    await navigator.clipboard.writeText(text.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-6 rounded-lg overflow-hidden border border-[var(--border)] shadow-lg">
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-[#1a1b1e] border-b border-[var(--border)]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] transition-all duration-200"
              style={{
                filter: hovered ? "brightness(1.3)" : undefined,
                transform: hovered ? "scale(1.15)" : undefined,
              }}
            />
            <span
              className="w-2.5 h-2.5 rounded-full bg-[#febc2e] transition-all duration-200"
              style={{
                filter: hovered ? "brightness(1.3)" : undefined,
                transform: hovered ? "scale(1.15)" : undefined,
              }}
            />
            <span
              className="w-2.5 h-2.5 rounded-full bg-[#28c840] transition-all duration-200"
              style={{
                filter: hovered ? "brightness(1.3)" : undefined,
                transform: hovered ? "scale(1.15)" : undefined,
              }}
            />
          </div>
          <span className="ml-2 text-[11px] text-[#666] font-mono">~ $</span>
        </div>
        <button
          onClick={handleCopy}
          className="relative flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-[#666] hover:text-[#e4e4e7] bg-[#ffffff08] hover:bg-[#ffffff12] rounded transition-all duration-150 active:scale-[0.95]"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="#28c840" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[#28c840]">Copied</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <div
        ref={codeRef}
        className="bg-[#0d0e10] p-4 overflow-x-auto [&_code]:!bg-transparent [&_code]:!p-0 [&_code]:text-[13px] [&_code]:leading-relaxed [&_code]:text-[#e4e4e7]"
      >
        {children}
      </div>
    </div>
  )
}
