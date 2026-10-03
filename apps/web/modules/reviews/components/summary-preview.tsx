"use client"

import { useState } from "react"
import { FileText, GitPullRequest, ShieldCheck } from "lucide-react"

import { MermaidDiagram } from "./mermaid-diagram"
import type { ReviewSettings } from "../review-settings"

const SAMPLE_SEQUENCE = `---
config:
  sequence:
    actorMargin: 16
    width: 100
    height: 40
    mirrorActors: false
    wrap: true
---
sequenceDiagram
    participant Dashboard
    participant API
    participant Database
    Dashboard->>API: Save review preferences
    API->>API: Validate repository ownership
    API->>Database: Persist preferences
    Database-->>API: Preferences saved
    API-->>Dashboard: Confirm changes`

function CollapsiblePreviewSection({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-md border border-border px-3 py-2.5"
    >
      <summary className="cursor-pointer text-xs font-medium text-foreground">
        {title}
      </summary>
      {open ? <div className="mt-3">{children}</div> : null}
    </details>
  )
}

function PreviewSection({
  title,
  collapsible,
  defaultOpen,
  children,
}: {
  title: string
  collapsible?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  if (collapsible) {
    return (
      <CollapsiblePreviewSection
        key={`${title}-${defaultOpen}`}
        title={title}
        defaultOpen={defaultOpen}
      >
        {children}
      </CollapsiblePreviewSection>
    )
  }
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  )
}

export function SummaryPreview({ settings }: { settings: ReviewSettings }) {
  const hasSections =
    settings.includeSummary ||
    settings.includeConfidence ||
    settings.includeFindings ||
    settings.includeSequenceDiagram

  return (
    <aside
      aria-label="PR summary preview"
      className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <FileText className="size-3.5 text-muted-foreground" /> Live preview
        </div>
        <span className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          Sample PR
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-3">
          <GitPullRequest className="size-3.5 text-muted-foreground" />
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            feat: add repository settings
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            #128
          </span>
        </div>
        <div className="p-4">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md border border-border bg-muted/30 font-mono text-xs font-bold">
              S
            </div>
            <div>
              <span className="text-xs font-semibold">supercode</span>
              <span className="ml-1.5 rounded border border-border px-1 text-[9px] text-muted-foreground">
                bot
              </span>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                reviewed just now
              </p>
            </div>
          </div>
          {settings.commentHeader ? (
            <p className="mb-4 whitespace-pre-wrap break-words border-b border-border pb-4 text-xs text-muted-foreground">
              {settings.commentHeader}
            </p>
          ) : null}
          <h3 className="mb-5 text-sm font-semibold tracking-tight">
            {settings.imageBadges ? "🤖 " : ""}Supercode AI Review
          </h3>
          <div className="space-y-5 text-[11px] leading-relaxed text-muted-foreground">
            {settings.includeSummary ? (
              <PreviewSection
                title="PR Summary"
                collapsible={settings.summaryCollapsible}
                defaultOpen={settings.summaryDefaultOpen}
              >
                <p>
                  Adds repository-level preferences for automatic reviews and PR
                  summaries. Teams can tailor the review output without changing
                  their workflow.
                </p>
                <div className="mt-3 space-y-1.5 border-l-2 border-border pl-3">
                  <p>Added review configuration controls</p>
                  <p>Connected preferences to the review engine</p>
                  <p>Preserved the author’s PR description</p>
                </div>
              </PreviewSection>
            ) : null}
            {settings.includeConfidence ? (
              <PreviewSection title="Confidence Score">
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="size-4 text-foreground" />
                  <span className="font-mono text-sm font-medium text-foreground">
                    4 / 5
                  </span>
                </div>
                <p>
                  The changes are well-scoped. Verify authorization before
                  merging.
                </p>
              </PreviewSection>
            ) : null}
            {settings.includeFindings ? (
              <PreviewSection title="Findings">
                <div className="rounded-md border border-border bg-muted/15 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-foreground">
                      High
                    </span>
                    <span className="font-medium text-foreground">
                      Check repository ownership
                    </span>
                  </div>
                  <p>
                    Validate the signed-in user owns the repository before
                    saving preferences.
                  </p>
                  <code className="mt-2 block break-all text-[9px]">
                    modules/reviews/settings-actions.ts
                  </code>
                </div>
              </PreviewSection>
            ) : null}
            {settings.includeSequenceDiagram ? (
              <PreviewSection
                title="Sequence Diagram"
                collapsible={settings.diagramCollapsible}
                defaultOpen={settings.diagramDefaultOpen}
              >
                <MermaidDiagram
                  source={SAMPLE_SEQUENCE}
                  description="The dashboard sends review preferences to the API, which validates repository ownership, saves them in the database, and confirms the changes."
                />
                <p className="mt-2 text-[10px]">
                  The same Mermaid sequence diagram renders on GitHub.
                </p>
              </PreviewSection>
            ) : null}
            {!hasSections ? (
              <p>
                Review complete. See inline comments for any actionable
                findings.
              </p>
            ) : null}
          </div>
          <div className="mt-6 border-t border-border pt-3 text-[9px] leading-relaxed text-muted-foreground">
            Automated review by{" "}
            <span className="text-foreground">Supercode</span> ·{" "}
            {settings.imageBadges ? "👍 / 👎" : "positive / negative"} feedback
          </div>
        </div>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
        An illustrative preview of your GitHub review comment. Actual content is
        generated from each pull request.
      </p>
    </aside>
  )
}
