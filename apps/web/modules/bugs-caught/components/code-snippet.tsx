"use client"

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CodeSnippet as CodeSnippetData } from "../lib/parse-findings"

const KIND_LABEL: Record<CodeSnippetData["kind"], string> = {
  issue: "Issue",
  fix: "Suggested fix",
  diff: "Diff",
  code: "Code",
}

const KIND_ACCENT: Record<CodeSnippetData["kind"], string> = {
  issue: "text-red-400/90",
  fix: "text-emerald-400/90",
  diff: "text-sky-400/90",
  code: "text-muted-foreground/70",
}

function isDiffLine(line: string) {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return "meta" as const
  }
  if (line.startsWith("+")) return "add" as const
  if (line.startsWith("-")) return "del" as const
  return "ctx" as const
}

function DiffBody({ code }: { code: string }) {
  const lines = code.split("\n")
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.65]">
        <tbody>
          {lines.map((line, i) => {
            const kind = isDiffLine(line)
            return (
              <tr
                key={i}
                className={cn(
                  kind === "add" && "bg-emerald-500/[0.08]",
                  kind === "del" && "bg-red-500/[0.08]",
                  kind === "meta" && "bg-sky-500/[0.06]",
                )}
              >
                <td
                  className={cn(
                    "w-10 select-none border-r border-white/[0.04] px-2 text-right align-top text-[11px] text-zinc-600",
                  )}
                >
                  {i + 1}
                </td>
                <td
                  className={cn(
                    "whitespace-pre px-3 py-0 align-top",
                    kind === "add" && "text-emerald-300/90",
                    kind === "del" && "text-red-300/90",
                    kind === "meta" && "text-sky-300/80",
                    kind === "ctx" && "text-zinc-300",
                  )}
                >
                  {line.length === 0 ? " " : line}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PlainBody({ code }: { code: string }) {
  const lines = code.split("\n")
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.65]">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="supports-[hover:hover]:hover:bg-white/[0.02]">
              <td className="w-10 select-none border-r border-white/[0.04] px-2 text-right align-top text-[11px] text-zinc-600">
                {i + 1}
              </td>
              <td className="whitespace-pre px-3 py-0 align-top text-zinc-300">
                {line.length === 0 ? " " : line}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CodeSnippet({
  snippet,
  filePath,
  className,
}: {
  snippet: CodeSnippetData
  filePath?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const language = useMemo(() => {
    if (snippet.language && snippet.language !== "text") return snippet.language
    return "text"
  }, [snippet.language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // ignore
    }
  }

  const isDiff = snippet.kind === "diff" || language === "diff"

  return (
    <div
      className={cn(
        "group/snippet mt-3 overflow-hidden rounded-xl border border-zinc-800/90 bg-[#0d1117]",
        "shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/90 bg-[#0d1117] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold tracking-wide uppercase",
              KIND_ACCENT[snippet.kind],
            )}
          >
            {KIND_LABEL[snippet.kind]}
          </span>
          {filePath ? (
            <>
              <span className="text-zinc-700" aria-hidden>
                ·
              </span>
              <span className="truncate font-mono text-[11px] text-zinc-500">
                {filePath}
              </span>
            </>
          ) : null}
          {language && language !== "text" ? (
            <>
              <span className="text-zinc-700" aria-hidden>
                ·
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-zinc-600">
                {language}
              </span>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2",
            "text-[11px] text-zinc-400",
            "transition-[transform,color,background-color,border-color] duration-150 ease-out",
            "active:scale-[0.97]",
            "supports-[hover:hover]:hover:border-zinc-700 supports-[hover:hover]:hover:bg-zinc-800/80 supports-[hover:hover]:hover:text-zinc-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-400" />
              <span className="text-emerald-400/90">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="py-2">
        {isDiff ? <DiffBody code={snippet.code} /> : <PlainBody code={snippet.code} />}
      </div>
    </div>
  )
}

export function FindingSnippets({
  snippets,
  filePath,
}: {
  snippets: CodeSnippetData[]
  filePath?: string
}) {
  if (!snippets.length) return null

  return (
    <div className="mt-1 space-y-2.5">
      {snippets.map((snippet, i) => (
        <CodeSnippet
          key={`${snippet.kind}-${i}`}
          snippet={snippet}
          filePath={filePath}
        />
      ))}
    </div>
  )
}
