"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Activity,
  AtSign,
  Check,
  CircleDot,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { ApprovalRequest, TimelineEntry } from "@/modules/nova-web/types"

export function NovaMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-full bg-[#2dd4bf]/15 text-[#2dd4bf]",
        size === "sm" ? "size-6" : "size-7",
      )}
    >
      <Sparkles className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2} />
    </div>
  )
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="nova-md text-[14.5px] leading-7 text-[#d6d6d6]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="mb-3 mt-5 text-[18px] font-semibold text-white first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2.5 mt-5 text-[16px] font-semibold text-white first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-[15px] font-semibold text-white first:mt-0">{children}</h3>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-[#ececec]">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} className="text-[#2dd4bf] underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className)
            if (!isBlock) {
              return (
                <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[12.5px] text-[#e8e8e8]">
                  {children}
                </code>
              )
            }
            return (
              <code className={cn("block font-mono text-[12.5px] leading-5 text-[#d4d4d4]", className)}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#121212] p-3.5">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-xl border border-white/[0.08]">
              <table className="w-full border-collapse text-left text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.04] text-[#c8c8c8]">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-white/[0.06] px-3 py-2 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-white/[0.04] px-3 py-2 text-[#b8b8b8]">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-white/[0.12] pl-3 text-[#a0a0a0]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-white/[0.08]" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function WorkedFor({ seconds }: { seconds: number }) {
  if (seconds < 1) return null
  const label =
    seconds < 60
      ? `${seconds}s`
      : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`
  return (
    <p className="my-4 text-center text-[12px] text-[#5c5c5c]">Worked for {label}</p>
  )
}

export function TimelineItem({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "message") {
    const fromUser = entry.role === "user"
    if (fromUser) {
      return (
        <article className="flex justify-end py-3">
          <div className="max-w-[min(560px,85%)] rounded-2xl bg-[#2a2a2a] px-4 py-2.5 text-[14.5px] leading-6 text-[#ececec]">
            <div className="whitespace-pre-wrap">{entry.content}</div>
            {entry.references?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Attached references">
                {entry.references.map((reference) => (
                  <span key={`${reference.kind}:${reference.id}`} title={reference.description} className="inline-flex max-w-full items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-[#b8d9d4]">
                    <AtSign className="size-3 shrink-0" />
                    <span className="truncate">{reference.label}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      )
    }
    return (
      <article className="py-3">
        <MarkdownBody content={entry.content} />
      </article>
    )
  }

  const isError = entry.type === "error"
  const isApproval = entry.type === "approval_request"
  const isResponse = entry.type === "response"

  if (isResponse && entry.body) {
    return (
      <article className="py-3">
        <MarkdownBody content={entry.body} />
      </article>
    )
  }

  // Collapsed working status — Capy shows these as quiet "Worked for" lines, not heavy cards.
  if (entry.type === "acknowledgement" && entry.status === "working") {
    return null
  }

  return (
    <article
      className={cn(
        "my-3 rounded-xl border px-3.5 py-3",
        isError
          ? "border-red-500/20 bg-red-500/[0.04]"
          : isApproval
            ? "border-orange-400/20 bg-orange-400/[0.04]"
            : "border-white/[0.05] bg-white/[0.015]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-[#5c5c5c]">
          {isError ? (
            <X className="size-3 text-red-400" />
          ) : isApproval ? (
            <ShieldCheck className="size-3 text-orange-300" />
          ) : (
            <Activity className="size-3" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-[#c8c8c8]">
            {entry.title ?? entry.type.replaceAll("_", " ")}
          </p>
          {entry.body ? (
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[#6b6b6b]">{entry.body}</p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#3d3d3d]">
            <CircleDot className="size-2.5" />
            {entry.status}
          </div>
        </div>
      </div>
    </article>
  )
}

export function StreamingBubble({ text, phase }: { text: string; phase?: string | null }) {
  return (
    <article className="py-3">
      {phase && !text ? (
        <p className="flex items-center gap-2 text-[12.5px] text-[#6b6b6b]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#2dd4bf]" />
          {phase}
        </p>
      ) : null}
      {text ? (
        <div className="relative">
          <MarkdownBody content={text} />
          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[#2dd4bf]/80 align-middle" />
        </div>
      ) : null}
    </article>
  )
}

export function ApprovalCard({
  approval,
  deciding,
  onDecision,
}: {
  approval: ApprovalRequest
  deciding: boolean
  onDecision: (approval: ApprovalRequest, decision: "approved" | "denied") => void
}) {
  return (
    <div className="rounded-xl border border-orange-400/20 bg-orange-400/[0.04] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px] font-medium text-orange-200/90">
            <ShieldCheck className="size-3.5" />
            Approval required
          </div>
          <p className="mt-2 text-[12px] font-medium capitalize text-[#c8c8c8]">
            {approval.capability.replaceAll("_", " ")}
          </p>
          {approval.mutation ? (
            <>
              <p className="mt-1 truncate font-mono text-[10px] text-[#5c5c5c]">
                {approval.mutation.tool} · {JSON.stringify(approval.mutation.target)}
              </p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[12px] leading-5 text-[#a0a0a0]">
                {approval.mutation.text}
              </p>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={deciding}
            onClick={() => onDecision(approval, "denied")}
            className="h-8 rounded-lg border border-white/[0.08] px-3 text-[12px] text-[#a0a0a0] transition hover:bg-white/[0.04] disabled:opacity-50"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={deciding}
            onClick={() => onDecision(approval, "approved")}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[#2dd4bf] px-3 text-[12px] font-medium text-[#0a0a0a] transition hover:bg-[#5eead4] disabled:opacity-50 active:scale-[0.98]"
          >
            <Check className="size-3.5" />
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
