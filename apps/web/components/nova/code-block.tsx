"use client"

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
  maxHeight?: number
}

export function CodeBlock({ code, language, className, maxHeight = 384 }: CodeBlockProps) {
  const [wrapped, setWrapped] = useState(false)
  const [copied, setCopied] = useState(false)

  const lineCount = useMemo(() => (code ? code.split("\n").length : 0), [code])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard API unavailable (insecure context) — no-op.
    }
  }

  return (
    <div
      className={cn(
        "group/code relative overflow-hidden rounded-lg border border-border bg-[#0d0d0d]",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {language ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {language}
            </span>
          ) : null}
          <span className="truncate font-mono text-[11px] text-muted-foreground/70">
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setWrapped((v) => !v)}
            aria-pressed={wrapped}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {wrapped ? "No wrap" : "Wrap"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {/* Code */}
      <pre
        className={cn(
          "overflow-auto p-3 font-mono text-[12.5px] leading-relaxed text-foreground/85",
          wrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}
