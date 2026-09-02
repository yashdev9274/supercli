"use client"

import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

function isCheckboxElement(node: unknown): node is {
  type: unknown
  props?: { type?: string; checked?: boolean }
} {
  if (!node || typeof node !== "object" || !("props" in node)) return false
  const props = (node as { props?: { type?: string } }).props
  return props?.type === "checkbox"
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-[18px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-7 border-b border-border/60 pb-1.5 text-[15px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 text-[13.5px] font-semibold tracking-tight text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-4 text-[13px] font-semibold text-foreground/95 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[13.5px] leading-[1.7] text-foreground/85 last:mb-0">
      {children}
    </p>
  ),
  a: ({ href, children }) => {
    const external = href?.startsWith("http")
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-primary underline decoration-primary/30 underline-offset-3 transition-colors hover:decoration-primary"
      >
        {children}
      </a>
    )
  },
  ul: ({ children }) => (
    <ul className="mb-3 list-none space-y-1.5 pl-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-[13.5px] text-foreground/85 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children, className, ...props }) => {
    const childArray = Array.isArray(children) ? children : [children]
    const checkbox = childArray.find(isCheckboxElement)
    const isTask =
      Boolean(checkbox) || className?.includes("task-list-item") === true

    if (isTask) {
      const checked = Boolean(checkbox?.props?.checked)
      const rest = childArray.filter((c) => !isCheckboxElement(c))
      return (
        <li className="flex items-start gap-2.5 text-[13.5px] leading-[1.65]">
          <span
            className={cn(
              "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
              checked
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                : "border-border bg-transparent",
            )}
            aria-hidden
          >
            {checked ? <Check className="h-2.5 w-2.5" /> : null}
          </span>
          <span
            className={cn(
              "min-w-0 text-foreground/85",
              checked && "text-muted-foreground line-through",
            )}
          >
            {rest}
          </span>
        </li>
      )
    }

    return (
      <li
        className={cn(
          "flex gap-2.5 text-[13.5px] leading-[1.65] text-foreground/85",
          className,
        )}
        {...props}
      >
        <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/45" />
        <span className="min-w-0">{children}</span>
      </li>
    )
  },
  // Native checkboxes are replaced by styled markers in `li`
  input: () => null,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-[13.5px] leading-relaxed text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border/70" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-foreground/80">{children}</em>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"))
    if (!isBlock) {
      return (
        <code
          className="rounded border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-[12px] text-foreground/90"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className={cn("font-mono text-[12px] text-foreground/90", className)}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-border bg-[#0c0c0c] px-3.5 py-3 font-mono text-[12px] leading-relaxed text-foreground/85 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-border last:mb-0">
      <table className="w-full min-w-[320px] border-collapse text-left text-[12.5px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/35 text-muted-foreground">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border/70">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-border/50 last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-[12.5px] leading-relaxed text-foreground/85">
      {children}
    </td>
  ),
  del: ({ children }) => (
    <del className="text-muted-foreground line-through">{children}</del>
  ),
}

/** Renders AI review markdown as readable prose (not a monospaced source dump). */
export function ReviewMarkdown({ source }: { source: string }) {
  if (!source?.trim()) {
    return <p className="text-sm text-muted-foreground">No review content.</p>
  }

  return (
    <div className="review-md max-w-none text-[13.5px] leading-relaxed text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
