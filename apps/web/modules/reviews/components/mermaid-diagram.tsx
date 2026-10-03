"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

let renderQueue = Promise.resolve()

type DiagramResult = {
  source: string
  theme: string
  svg: string | null
}

export function MermaidDiagram({
  source,
  description = "Diagram illustrating the pull request’s flow. The Mermaid source is available below.",
}: {
  source: string
  description?: string
}) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "neutral"
  const [result, setResult] = useState<DiagramResult | null>(null)
  const current =
    result?.source === source && result.theme === theme ? result : null

  useEffect(() => {
    let cancelled = false

    renderQueue = renderQueue.then(async () => {
      if (cancelled) return
      let container: HTMLDivElement | undefined

      try {
        const { default: mermaid } = await import("mermaid")
        if (cancelled) return

        mermaid.startOnLoad = false
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          logLevel: 5,
          theme,
          htmlLabels: false,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          secure: [
            "secure",
            "securityLevel",
            "startOnLoad",
            "suppressErrorRendering",
            "logLevel",
            "maxTextSize",
            "maxEdges",
            "htmlLabels",
            "fontFamily",
            "theme",
            "themeVariables",
            "themeCSS",
          ],
        })

        container = document.createElement("div")
        container.setAttribute("aria-hidden", "true")
        container.style.cssText =
          "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none"
        document.body.append(container)

        const { svg } = await mermaid.render(
          `mermaid-${crypto.randomUUID()}`,
          source,
          container,
        )
        if (!cancelled) setResult({ source, theme, svg })
      } catch {
        if (!cancelled) setResult({ source, theme, svg: null })
      } finally {
        container?.remove()
      }
    })

    return () => {
      cancelled = true
    }
  }, [source, theme])

  return (
    <div className="mb-3 min-w-0 rounded-lg border border-border bg-muted/15 p-3 last:mb-0">
      {current?.svg ? (
        <div
          role="img"
          aria-label={description}
          className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: current.svg }}
        />
      ) : (
        <p
          role="status"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {current
            ? "This diagram couldn’t be rendered. You can read its Mermaid source below."
            : "Loading diagram… Mermaid source is available below."}
        </p>
      )}
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Mermaid source</summary>
        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
          <code>{source}</code>
        </pre>
      </details>
    </div>
  )
}
