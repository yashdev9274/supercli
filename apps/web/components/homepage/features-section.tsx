import Link from "next/link"

const repositories = [
  { name: "web", detail: "apps/web", status: "Mapped" },
  { name: "desktop", detail: "SupercodeDesktop", status: "Mapped" },
  { name: "platform", detail: "packages", status: "Synced" },
]

const planItems = [
  "Clarify the outcome",
  "Map the codebase",
  "Trace dependencies",
  "Design the change",
  "Check the approach",
]

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="size-3.5"
    >
      <path
        d="M3 8h9.5M9 4.5 12.5 8 9 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AutomationPreview() {
  return (
    <div className="relative min-h-[470px] overflow-hidden border border-white/10 bg-card bg-[url('/cloudy.png')] bg-cover bg-center bg-no-repeat sm:min-h-[520px]">
      <div className="relative mx-auto mt-8 w-[62%] rounded-xl border border-white/10 bg-[#1b1b1a]/90 px-5 py-3 text-center text-[11px] leading-5 text-white/62 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
        Every weekday, inspect stale issues, confirm what still matters, and move the right work forward.
      </div>
      <div aria-hidden="true" className="mx-auto h-8 w-px bg-white/14" />

      <div className="relative mx-auto w-[74%] rounded-2xl border border-white/12 bg-[#1a1a19]/95 p-5 shadow-[0_28px_70px_rgba(0,0,0,0.48)] sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/25">Workflow</p>
            <h4 className="mt-1 text-[14px] font-semibold text-white/78">Continuous repository care</h4>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/7 px-2.5 py-1 font-mono text-[8px] text-emerald-400">ACTIVE</span>
        </div>

        <div className="mt-5">
          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/25">Trigger</p>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/9 bg-[#111110] p-3 text-[10px] text-white/52">
            <span className="text-primary">◷</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Every weekday</span>
            <span>at</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">9:00 AM</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/9 bg-[#111110] p-3 text-[10px] text-white/52">
            <span className="text-primary">⑂</span>
            <span>Issue in</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">supercode-cli</span>
            <span>with</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">status: open</span>
          </div>
        </div>

        <div className="mt-5">
          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/25">Action</p>
          <div className="mt-2 rounded-lg border border-white/9 bg-[#111110] p-3 text-[10px] leading-5 text-white/48">
            Review issues inactive for 14 days. Reproduce confirmed bugs, refresh outdated context, run the relevant tests, and open a fix when the evidence is clear.
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4 font-mono text-[8px]">
          <span className="text-white/28">Last run · today at 9:00 AM</span>
          <span className="text-emerald-400">✓ 6 issues advanced</span>
        </div>
      </div>
    </div>
  )
}

function ReviewPreview() {
  const findings = [
    { tone: "danger", label: "Security", title: "Unchecked redirect accepts external URLs", path: "auth/callback.ts:84" },
    { tone: "danger", label: "Bug", title: "Parallel requests overwrite cached state", path: "stores/session.ts:126" },
    { tone: "warning", label: "Quality", title: "Error branch leaves loading state active", path: "components/review.tsx:58" },
  ]

  return (
    <div className="relative min-h-[470px] overflow-hidden border border-white/10 bg-card bg-[url('/cloudy.png')] bg-cover bg-center bg-no-repeat sm:min-h-[520px]">
      <div className="absolute left-[5%] top-[8%] w-[76%] rounded-2xl border border-white/12 bg-[#191918]/95 p-5 shadow-[0_28px_70px_rgba(0,0,0,0.48)] sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/7 px-2.5 py-1 font-mono text-[8px] text-emerald-400">
            OPEN
          </span>
          <div className="font-mono text-[8px]">
            <span className="text-white/30">12 files</span>
            <span className="ml-3 text-emerald-400">+186</span>
            <span className="ml-1.5 text-red-400">-24</span>
          </div>
        </div>

        <h4 className="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-white/82">
          Add Nova engineering workflow
        </h4>
        <p className="mt-1 font-mono text-[8px] text-white/28">
          supercode-cli #314 · nova/features → supercode-cli
        </p>

        <div className="mt-5 border-t border-white/8 pt-4">
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/25">
            Nova&apos;s analysis
          </p>
          <p className="mt-3 max-w-[500px] text-[10px] leading-5 text-white/52">
            The change is structurally sound, but two paths need attention before merge. The review traced the affected boundaries, verified responsive behavior, and identified an unsafe redirect and a shared-state race.
          </p>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-white/8 bg-[#111110] font-mono text-[8px] leading-5">
          <p className="px-3 py-1 text-white/32"><span className="mr-3 text-white/18">42</span>const next = request.nextUrl.searchParams.get(&quot;next&quot;)</p>
          <p className="bg-red-400/7 px-3 py-1 text-red-300"><span className="mr-3 text-white/18">43</span>- return redirect(next)</p>
          <p className="bg-emerald-400/7 px-3 py-1 text-emerald-300"><span className="mr-3 text-white/18">43</span>+ return redirect(safeInternalPath(next))</p>
          <p className="px-3 py-1 text-white/32"><span className="mr-3 text-white/18">44</span>&#125;</p>
        </div>
      </div>

      <div className="absolute bottom-[5%] right-[3%] w-[47%] rounded-xl border border-white/12 bg-[#1d1d1c] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-white/72">Review findings</p>
          <span className="font-mono text-[8px] text-white/28">3 issues</span>
        </div>
        <div className="mt-3 divide-y divide-white/7">
          {findings.map((finding) => (
            <div key={finding.title} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2">
                <span className={finding.tone === "danger" ? "text-red-400" : "text-primary"}>
                  {finding.tone === "danger" ? "◇" : "⚑"}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-white/25">{finding.label}</p>
                  <p className="mt-1 truncate text-[9px] font-medium text-white/64">{finding.title}</p>
                  <p className="mt-1 font-mono text-[7px] text-white/24">{finding.path}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CodeAndTestPreview() {
  return (
    <div className="relative min-h-[470px] overflow-hidden border border-white/10 bg-card bg-[url('/cloudy.png')] bg-cover bg-center bg-no-repeat sm:min-h-[520px]">
      <div className="absolute left-[5%] top-[26%] w-[48%] overflow-hidden rounded-xl border border-white/10 bg-[#151514] shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex h-10 items-center justify-between border-b border-white/8 px-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-primary/12 font-mono text-[8px] text-primary">
              ✓
            </span>
            <span className="text-[10px] font-semibold text-white/72">
              Landing page
            </span>
          </div>
          <span className="font-mono text-[8px] text-emerald-400">
            18 tests passed
          </span>
        </div>

        <div className="grid grid-cols-[1fr_1.35fr]">
          <div className="border-r border-white/8 p-3 font-mono text-[8px]">
            <p className="text-white/25">CHANGED FILES</p>
            <div className="mt-3 space-y-2 text-white/40">
              <p><span className="text-emerald-400">M</span> hero.tsx</p>
              <p><span className="text-emerald-400">A</span> features-section.tsx</p>
              <p><span className="text-emerald-400">M</span> page.tsx</p>
            </div>
          </div>
          <div className="p-3 font-mono text-[8px] leading-5">
            <p><span className="text-white/20">18</span> <span className="text-sky-300">export default</span> <span className="text-white/55">function Features()</span></p>
            <p><span className="text-white/20">19</span> <span className="text-white/55">  return (</span></p>
            <p className="bg-emerald-400/6 text-emerald-300"><span className="text-white/20">20</span> +  &lt;section className=&quot;features&quot;&gt;</p>
            <p className="bg-emerald-400/6 text-emerald-300"><span className="text-white/20">21</span> +    &lt;NovaWorkflow /&gt;</p>
            <p className="bg-emerald-400/6 text-emerald-300"><span className="text-white/20">22</span> +  &lt;/section&gt;</p>
            <p><span className="text-white/20">23</span> <span className="text-white/55">  )</span></p>
          </div>
        </div>
      </div>

      <div className="absolute right-[5%] top-[12%] w-[64%] rounded-2xl border border-white/12 bg-[#1a1a19]/95 p-5 shadow-[0_28px_70px_rgba(0,0,0,0.48)] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">
            N
          </span>
          <div>
            <p className="text-[12px] font-semibold text-white/82">Nova</p>
            <p className="font-mono text-[8px] text-white/28">just now</p>
          </div>
        </div>

        <p className="mt-5 max-w-[470px] text-[12px] leading-6 text-white/58">
          Built the workflow experience and verified it across desktop and mobile. Responsive behavior, accessibility checks, and the repository&apos;s quality gates all pass.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 font-mono text-[8px]">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/7 px-2.5 py-1.5 text-emerald-400">✓ lint</span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/7 px-2.5 py-1.5 text-emerald-400">✓ typecheck</span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/7 px-2.5 py-1.5 text-emerald-400">✓ 18 tests</span>
        </div>

        <div className="mt-5 rounded-xl border border-white/9 bg-[#111110] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold text-white/74">
                feat: add Nova workflow features
              </p>
              <p className="mt-1 font-mono text-[8px] text-white/28">
                supercode-cli · #314
              </p>
            </div>
            <div className="font-mono text-[9px]">
              <span className="text-emerald-400">+186</span>
              <span className="ml-2 text-red-400">-24</span>
            </div>
          </div>
          <div className="mt-4 inline-flex rounded-md bg-white px-3 py-2 text-[9px] font-semibold text-black">
            View pull request
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanningPreview() {
  return (
    <div className="relative min-h-[470px] overflow-hidden border border-white/10 bg-card bg-[url('/cloudy.png')] bg-cover bg-center bg-no-repeat sm:min-h-[520px]">
      <div className="relative grid grid-cols-3 gap-3 px-5 pt-7 sm:px-8">
        {repositories.map((repository) => (
          <div
            key={repository.name}
            className="rounded-xl border border-white/12 bg-[#1a1a19]/90 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.25)]"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/12 font-mono text-[9px] text-primary">
                {repository.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-white/75">
                  {repository.name}
                </p>
                <p className="truncate font-mono text-[8px] text-white/28">
                  {repository.detail}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 font-mono text-[8px] text-white/35">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {repository.status}
            </div>
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="absolute left-[18%] top-[119px] h-px w-[64%] bg-white/12" />
      <div aria-hidden="true" className="absolute left-1/2 top-[119px] h-9 w-px bg-white/12" />

      <div className="relative mx-auto mt-9 grid w-[86%] grid-cols-[150px_1fr] overflow-hidden rounded-t-xl border border-white/10 bg-[#171716] shadow-[0_20px_50px_rgba(0,0,0,0.35)] sm:grid-cols-[180px_1fr]">
        <aside className="border-r border-white/8 p-3">
          <p className="mb-3 font-mono text-[8px] uppercase tracking-[0.16em] text-white/25">
            Implementation plan
          </p>
          <div className="space-y-1">
            {planItems.map((item, index) => (
              <div
                key={item}
                className={`rounded-md px-2.5 py-2 text-[9px] ${
                  index === 3
                    ? "bg-primary/10 text-primary"
                    : "text-white/35"
                }`}
              >
                <span className="mr-2 font-mono text-[7px] text-white/20">
                  0{index + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 bg-[#121211] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-white/8 pb-4">
            <div>
              <p className="text-[14px] font-semibold text-white/80">
                Homepage workflow architecture
              </p>
              <p className="mt-1 font-mono text-[8px] text-white/28">
                3 systems · 8 dependencies · risks mapped
              </p>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/8 px-2 py-1 font-mono text-[8px] text-primary">
              PLAN
            </span>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_40px_1fr] items-center gap-1 font-mono text-[8px]">
            <div className="rounded-lg border border-white/9 bg-white/[0.025] p-3 text-white/55">
              <span className="text-primary">01</span>
              <p className="mt-2 text-[10px] font-sans font-semibold text-white/72">
                Product foundation
              </p>
              <p className="mt-1 text-white/28">layout · navigation · design system</p>
            </div>
            <div className="flex items-center justify-center text-white/20">→</div>
            <div className="rounded-lg border border-white/9 bg-white/[0.025] p-3 text-white/55">
              <span className="text-primary">02</span>
              <p className="mt-2 text-[10px] font-sans font-semibold text-white/72">
                Workflow experience
              </p>
              <p className="mt-1 text-white/28">hero · workflow · desktop UI</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-white/10 p-3">
            <div className="flex items-center gap-2 font-mono text-[8px] text-white/38">
              <span className="text-emerald-400">✓</span>
              Affected routes, components, and boundaries mapped
            </div>
            <div className="mt-2 flex items-center gap-2 font-mono text-[8px] text-white/38">
              <span className="text-emerald-400">✓</span>
              Existing patterns and design system preserved
            </div>
            <div className="mt-2 flex items-center gap-2 font-mono text-[8px] text-white/38">
              <span className="text-primary">◆</span>
              Ready for implementation
            </div>
          </div>
        </div>
      </div>
    </div>
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
              Nova reads across repositories, follows dependencies, and identifies the boundaries that matter before touching code. You get a practical plan based on how your system actually works.
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
              Nova edits the right files, runs the project, and works through failures in your environment. Every command and change stays visible, ending with tested code ready for review.
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
              Nova evaluates each pull request against the wider codebase—not only the diff. It explains concrete bugs, security risks, and regressions at the exact line where action is needed.
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
              Run recurring engineering work on a schedule or in response to repository events. Nova triages issues, refreshes dependencies, closes coverage gaps, and handles maintenance before it becomes backlog.
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
