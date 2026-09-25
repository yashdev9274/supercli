import type { Metadata } from "next"
import { Bot, Check, CodeXml, MessagesSquare, Mic2 } from "lucide-react"

import { ClipboardListIcon } from "@/components/animate-ui/icons/clipboard-list"
import Footer from "@/components/homepage/footer"
import Navbar from "@/components/homepage/navbar"
import { NovaInviteForm } from "./nova-invite-form"

export const metadata: Metadata = {
  title: "Nova — The AI Engineer | Supercode",
  description:
    "Meet Nova by Supercode: an AI engineer that owns tasks, works through an agent harness, reviews code, and collaborates with your team by voice.",
  openGraph: {
    title: "Nova — The AI Engineer",
    description:
      "An accountable AI engineering teammate for implementation, code review, communication, and voice collaboration.",
    url: "/nova",
  },
}

const capabilities = [
  {
    icon: Bot,
    label: "Agent harness",
    detail: "Plans, executes, tests, and reports instead of stopping at suggestions.",
  },
  {
    icon: CodeXml,
    label: "Code review",
    detail: "Understands the codebase, surfaces risk, and helps move pull requests forward.",
  },
  {
    icon: Mic2,
    label: "Voice native",
    detail: "Discuss work, make decisions, and steer tasks as naturally as a teammate.",
  },
  {
    icon: MessagesSquare,
    label: "Team connected",
    detail: "Built to work where engineering teams already coordinate and communicate.",
  },
]

export default function NovaPage() {
  return (
    <main className="dark landing-fonts relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "linear-gradient(to bottom, black 10%, transparent 78%)",
        }}
      />
      <Navbar />

      <section className="relative mx-auto w-full max-w-[1240px] px-5 pb-28 pt-32 sm:px-8 sm:pt-40 lg:px-12 lg:pb-36">
        <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)] lg:gap-16 xl:gap-24">
          <div className="pt-2 lg:pt-10">
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/[0.055] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary shadow-[inset_0_0_20px_hsl(var(--primary)/0.025)]">
              <span className="relative flex size-2 items-center justify-center">
                <span className="absolute size-2 animate-ping rounded-full bg-primary/35 motion-reduce:hidden" />
                <span className="relative size-1.5 rounded-full bg-primary" />
              </span>
              Early Invite
            </div>

            {/* <p className="mb-4 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground/55">
              Supercode / 01
            </p> */}
            <h1 className="max-w-4xl text-balance text-[clamp(3.35rem,7vw,6.8rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-white">
              Meet Nova.
              <span className="mt-2 block text-muted-foreground/60">Your AI engineer.</span>
            </h1>

            <p className="mt-8 max-w-xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
              Give Nova an outcome, not a prompt. It plans the work, writes and
              reviews the code, runs the checks, and keeps your team in the loop.
            </p>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-y border-white/[0.07] py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground/70">
              {["Owns the task", "Works in your repo", "Reports back"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check className="size-3.5 text-primary" aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>

            {/* <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {capabilities.map(({ icon: Icon, label, detail }, index) => (
                <article
                  key={label}
                  className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:hover:-translate-y-0.5 hoverable:hover:border-primary/20 hoverable:hover:bg-white/[0.04]"
                >
                  <div
                    aria-hidden="true"
                    className="absolute right-4 top-3 font-mono text-[10px] text-white/20"
                  >
                    0{index + 1}
                  </div>
                  <div className="mb-6 flex size-9 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.055] text-primary transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hoverable:group-hover:scale-[1.04]">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <h2 className="font-mono text-sm font-medium text-foreground">
                    {label}
                  </h2>
                  <p className="mt-2 max-w-[32ch] text-sm leading-6 text-muted-foreground">
                    {detail}
                  </p>
                </article>
              ))}
            </div> */}

            <div className="mt-7 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/45">
              <span className="size-1 rounded-full bg-primary/70" />
              task → plan → implement → test → review → report
            </div>
          </div>

          <aside className="relative lg:sticky lg:top-50 lg:pt-10">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#171617]/90 shadow-[0_32px_100px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="size-1.5 rounded-full bg-white/20" />
                  <span className="size-1.5 rounded-full bg-white/12" />
                  <span className="size-1.5 rounded-full bg-white/8" />
                </div>
                <span>nova.init</span>
                <span className="ml-auto text-primary/80">request access</span>
              </div>
              <div className="border-b border-white/[0.07] px-5 py-5 sm:px-7">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.06] text-primary">
                    <ClipboardListIcon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">Tell me where you build.</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      A few details help us shape the first Nova teams.
                    </p>
                  </div>
                </div>
              </div>
              <NovaInviteForm />
            </div>
            <p className="mt-4 px-2 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
              Private beta · Invitations sent in small batches
            </p>
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  )
}
