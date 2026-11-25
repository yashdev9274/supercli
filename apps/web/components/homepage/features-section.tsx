import type { ReactNode } from "react"
import Link from "next/link"
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileCode2,
  GitBranch,
  GitPullRequest,
  Layers3,
  Play,
  ShieldCheck,
  Terminal,
} from "lucide-react"

import styles from "./feature-previews.module.css"

const repositories = [
  { name: "web", detail: "apps/web" },
  { name: "desktop", detail: "SupercodeDesktop" },
  { name: "platform", detail: "packages" },
]

const planItems = [
  "Clarify the outcome",
  "Map the codebase",
  "Trace dependencies",
  "Design the change",
  "Check the approach",
]

function ArrowIcon() {
  return <ArrowUpRight size={15} aria-hidden="true" />
}

function PreviewFrame({
  title,
  label,
  children,
}: {
  title: string
  label: string
  children: ReactNode
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.toolbar}>
        <span className={styles.dots}>
          <i />
          <i />
          <i />
        </span>
        <span>{title}</span>
        <span className={styles.toolbarLabel}>{label}</span>
      </div>
      <div className={styles.stage}>{children}</div>
    </div>
  )
}

function PlanningPreview() {
  return (
    <PreviewFrame title="nova / plan" label="CONTEXT FIRST">
      <div className={styles.repositories}>
        {repositories.map((repo) => (
          <div key={repo.name}>
            <Layers3 size={16} />
            <strong>{repo.name}</strong>
            <span>{repo.detail}</span>
            <small>
              <i /> Mapped
            </small>
          </div>
        ))}
      </div>
      <div className={styles.connector} />
      <div className={styles.panel}>
        <div className={styles.panelHeading}>
          <span className={styles.icon}>
            <GitBranch size={17} />
          </span>
          <div>
            <strong>Homepage workflow architecture</strong>
            <p>3 systems · 8 dependencies · risks mapped</p>
          </div>
          <span className={styles.badge}>PLAN</span>
        </div>
        <div className={styles.planList}>
          {planItems.map((item, i) => (
            <div key={item} className={i === 3 ? styles.selected : undefined}>
              <span>
                {i < 3 ? <Check size={12} /> : String(i + 1).padStart(2, "0")}
              </span>
              {item}
              {i === 3 && <span className={styles.activeLabel}>In focus</span>}
            </div>
          ))}
        </div>
        <div className={styles.panelFooter}>
          <ShieldCheck size={13} />
          <span>Boundaries mapped. Ready for implementation.</span>
        </div>
      </div>
    </PreviewFrame>
  )
}

function CodeAndTestPreview() {
  return (
    <PreviewFrame title="nova / build" label="BUILD & VERIFY">
      <div className={styles.codePanel}>
        <div className={styles.codeTabs}>
          <span>
            <FileCode2 size={12} /> features-section.tsx
          </span>
          <small>
            +186 <span>−24</span>
          </small>
        </div>
        <div className={styles.code}>
          <div>
            <span>18</span>
            <code>export default function Features() &#123;</code>
          </div>
          <div>
            <span>19</span>
            <code> return (</code>
          </div>
          <div className={styles.addition}>
            <span>20</span>
            <code>+ &lt;section className=&quot;features&quot;&gt;</code>
          </div>
          <div className={styles.addition}>
            <span>21</span>
            <code>+ &lt;NovaWorkflow /&gt;</code>
          </div>
          <div className={styles.addition}>
            <span>22</span>
            <code>+ &lt;/section&gt;</code>
          </div>
          <div>
            <span>23</span>
            <code> )</code>
          </div>
        </div>
        <div className={styles.terminal}>
          <span>
            <Terminal size={12} /> bun run check
          </span>
          <p>
            <Check size={12} /> Lint passed <Check size={12} /> Types passed{" "}
            <Check size={12} /> 18 tests passed
          </p>
        </div>
      </div>
      <div className={styles.delivery}>
        <span className={styles.icon}>
          <GitPullRequest size={17} />
        </span>
        <div>
          <strong>Ready for your review</strong>
          <p>feat: add Nova workflow features</p>
        </div>
        <span className={styles.success}>
          <Check size={12} /> Verified
        </span>
      </div>
    </PreviewFrame>
  )
}

function ReviewPreview() {
  const findings = [
    {
      label: "Security",
      title: "Unchecked external redirect",
      path: "auth/callback.ts:84",
      severity: "High",
    },
    {
      label: "Concurrency",
      title: "Shared-state race condition",
      path: "stores/session.ts:126",
      severity: "High",
    },
    {
      label: "Quality",
      title: "Loading state left active",
      path: "components/review.tsx:58",
      severity: "Medium",
    },
  ]
  return (
    <PreviewFrame title="nova / review" label="CODEBASE AWARE">
      <div className={styles.panel}>
        <div className={styles.panelHeading}>
          <span className={styles.icon}>
            <GitPullRequest size={17} />
          </span>
          <div>
            <strong>Add Nova engineering workflow</strong>
            <p>#314 · nova/features → supercode-cli</p>
          </div>
          <span className={styles.success}>OPEN</span>
        </div>
        <div className={styles.reviewSummary}>
          <ShieldCheck size={16} />
          <div>
            <strong>Full context. Concrete findings.</strong>
            <p>
              Traced affected boundaries and verified the change against the
              wider codebase.
            </p>
          </div>
        </div>
        <div className={styles.findings}>
          {findings.map((f) => (
            <div key={f.path}>
              <span
                className={f.severity === "High" ? styles.high : styles.medium}
              >
                {f.severity}
              </span>
              <div>
                <small>{f.label}</small>
                <strong>{f.title}</strong>
                <code>{f.path}</code>
              </div>
              <ChevronRight size={14} />
            </div>
          ))}
        </div>
        <div className={styles.panelFooter}>
          <span className={styles.statusDot} />
          <span>12 files reviewed · 3 actionable findings</span>
        </div>
      </div>
    </PreviewFrame>
  )
}

function AutomationPreview() {
  return (
    <PreviewFrame title="nova / automations" label="ALWAYS MOVING">
      <div className={styles.schedule}>
        <span className={styles.scheduleIcon}>↻</span>
        <div>
          <strong>Continuous repository care</strong>
          <p>Routine work. Taken care of.</p>
        </div>
        <span className={styles.success}>
          <i /> Active
        </span>
      </div>
      <div className={styles.connector} />
      <div className={styles.panel}>
        <div className={styles.automationRow}>
          <span>WHEN</span>
          <div>
            <strong>Every weekday at 9:00 AM</strong>
            <p>On open issues in supercode-cli</p>
          </div>
        </div>
        <div className={styles.automationRow}>
          <span>THEN</span>
          <div>
            <strong>Keep the backlog moving</strong>
            <p>
              Review issues inactive for 14 days. Reproduce bugs, refresh
              context, run checks, and prepare a fix.
            </p>
          </div>
        </div>
        <div className={styles.automationRow}>
          <span>RUN</span>
          <div className={styles.runSteps}>
            <span>
              <Check size={12} /> Triage
            </span>
            <ChevronRight size={11} />
            <span>
              <Check size={12} /> Verify
            </span>
            <ChevronRight size={11} />
            <span>
              <GitPullRequest size={12} /> Deliver
            </span>
          </div>
        </div>
        <div className={styles.panelFooter}>
          <Play size={12} />
          <span>Last run today at 9:00 AM</span>
          <span className={styles.result}>6 issues advanced</span>
        </div>
      </div>
    </PreviewFrame>
  )
}

export default function FeaturesSection() {
  return (
    <section className="border-t border-border px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-[1280px]">
        <h2 className="max-w-[850px] text-balance text-[34px] font-medium leading-[1.08] tracking-[-0.045em] sm:text-[48px] lg:text-[58px]">
          <span className="text-white/32">Give Nova the outcome.</span>
          <span className="block text-white/88">
            It handles the engineering path to production.
          </span>
        </h2>

        <div className="mt-20 grid items-end gap-12 lg:mt-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="max-w-[530px] pb-2">
            <p className="font-mono text-[26px] font-medium text-white/30 sm:text-[32px]">
              01
            </p>
            <h3 className="mt-4 text-[28px] font-medium tracking-[-0.035em] text-white/88 sm:text-[36px]">
              Understand before changing
            </h3>
            <p className="mt-3 max-w-[520px] text-[15px] leading-7 text-white/42 sm:text-[17px]">
              Nova reads across repositories, follows dependencies, and
              identifies the boundaries that matter before touching code. You
              get a practical plan based on how your system actually works.
            </p>
            <Link
              href="/download"
              className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-primary transition-[gap,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:gap-3 hoverable:hover:text-primary/80"
            >
              See how Nova plans
              <ArrowIcon />
            </Link>
          </div>

          <PlanningPreview />
        </div>

        <div className="mt-24 grid items-center gap-12 border-t border-white/8 pt-24 lg:mt-32 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-32">
          <CodeAndTestPreview />

          <div className="max-w-[530px] lg:pl-4">
            <p className="font-mono text-[26px] font-medium text-white/30 sm:text-[32px]">
              02
            </p>
            <h3 className="mt-4 text-[28px] font-medium tracking-[-0.035em] text-white/88 sm:text-[36px]">
              Build, run, and verify
            </h3>
            <p className="mt-3 max-w-[520px] text-[15px] leading-7 text-white/42 sm:text-[17px]">
              Nova edits the right files, runs the project, and works through
              failures in your environment. Every command and change stays
              visible, ending with tested code ready for review.
            </p>
            <Link
              href="/download"
              className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-primary transition-[gap,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:gap-3 hoverable:hover:text-primary/80"
            >
              Ship a change with Nova
              <ArrowIcon />
            </Link>
          </div>
        </div>

        <div className="mt-24 grid items-center gap-12 border-t border-white/8 pt-24 lg:mt-32 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:pt-32">
          <div className="max-w-[530px] pb-2">
            <p className="font-mono text-[26px] font-medium text-white/30 sm:text-[32px]">
              03
            </p>
            <h3 className="mt-4 text-[28px] font-medium tracking-[-0.035em] text-white/88 sm:text-[36px]">
              Review with full context
            </h3>
            <p className="mt-3 max-w-[520px] text-[15px] leading-7 text-white/42 sm:text-[17px]">
              Nova evaluates each pull request against the wider codebase—not
              only the diff. It explains concrete bugs, security risks, and
              regressions at the exact line where action is needed.
            </p>
            <Link
              href="/code-review"
              className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-primary transition-[gap,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:gap-3 hoverable:hover:text-primary/80"
            >
              Explore contextual review
              <ArrowIcon />
            </Link>
          </div>

          <ReviewPreview />
        </div>

        <div className="mt-24 grid items-center gap-12 border-t border-white/8 pt-24 lg:mt-32 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-32">
          <AutomationPreview />

          <div className="max-w-[530px] lg:pl-4">
            <p className="font-mono text-[26px] font-medium text-white/30 sm:text-[32px]">
              04
            </p>
            <h3 className="mt-4 text-[28px] font-medium tracking-[-0.035em] text-white/88 sm:text-[36px]">
              Keep the codebase moving
            </h3>
            <p className="mt-3 max-w-[520px] text-[15px] leading-7 text-white/42 sm:text-[17px]">
              Run recurring engineering work on a schedule or in response to
              repository events. Nova triages issues, refreshes dependencies,
              closes coverage gaps, and handles maintenance before it becomes
              backlog.
            </p>
            <Link
              href="/download"
              className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-primary transition-[gap,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:gap-3 hoverable:hover:text-primary/80"
            >
              Put maintenance on autopilot
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
