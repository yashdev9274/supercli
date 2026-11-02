"use client";

import Navbar from "@/components/homepage/navbar";
import Footer from "@/components/homepage/footer";
import SupercardStage from "@/components/supercard/supercard-stage";
import { ArrowUpRight } from "lucide-react";

const FUNDAMENTALS = [
  {
    label: "01",
    title: "One wallet, every provider",
    body: "Prepaid balance powers inference, search, STT, TTS, browser, compute, embedding, and vector DB through a single statement. No more eight tabs, eight bills, eight surprise invoices.",
    detail: "Wallet → Card → Provider",
  },
  {
    label: "02",
    title: "Cards are spend envelopes",
    body: "Each virtual card scopes a category, locks providers, caps spend, and rates velocity. Sub-cards for agents, projects, and teammates inherit policy without inheriting panic.",
    detail: "category · providers · cap · velocity",
  },
  {
    label: "03",
    title: "Rewards fund themselves",
    body: "Every swipe mints a token from controlled spread — never from magical 1:1 cash. Tiers, partner credits, and burn-to-wallet redemption are opt-in economics, not a free-money loop.",
    detail: "spread → rewards → wallet credit",
  },
];

const PROVIDER_BANDS = [
  {
    label: "Founders & teams",
    body: "Cap runaway agent spend before the bill arrives. Per-card policy beats per-incident firefighting.",
  },
  {
    label: "Provider partners",
    body: "Net-new qualified volume, prepaid commit, and a control plane that lets you route without re-selling.",
  },
  {
    label: "Open-source agents",
    body: "A drop-in spend layer for LangChain, CrewAI, Claude Code, and bespoke tools — without owning the wallet.",
  },
];

export default function SupercardPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground antialiased">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[820px] bg-[radial-gradient(ellipse_at_top,rgba(108,118,255,0.18)_0%,rgba(108,118,255,0.04)_45%,rgba(0,0,0,0)_70%)]" />
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      {/* Hero */}
      <section className="relative px-6 pt-[200px] pb-24 sm:pt-[230px]">
        <div className="relative mx-auto flex max-w-[1180px] flex-col items-center text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-primary">
            Supercard · AI spend wallet
          </p>

          <h1 className="mt-7 max-w-[920px] text-balance text-[48px] font-medium leading-[0.98] tracking-[-0.055em] text-white sm:text-[68px] lg:text-[88px]">
            <span className="block">One card.</span>
            <span className="block text-white/56">Every AI dollar, on one statement.</span>
          </h1>

          <p className="mt-7 max-w-[640px] text-pretty text-[15px] leading-7 text-white/52 sm:text-[17px]">
            Supercard turns eight AI infrastructure bills into one prepaid wallet, eight category-scoped virtual cards, and a rewards engine funded by controlled spread — never by magic. Hover the card.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="https://cal.com/yash-dewasthale/talk-to-founder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-5 text-[13px] font-semibold text-black transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/90 active:scale-[0.97]"
            >
              Request early access
              <ArrowUpRight className="size-3.5" strokeWidth={1.6} />
            </a>
            <a
              href="#fundamentals"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/14 bg-white/[0.025] px-5 text-[13px] font-medium text-white/76 transition-[transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-white/24 hover:bg-white/5 active:scale-[0.97]"
            >
              Read the fundamentals
            </a>
          </div>

          <div className="mt-20 w-full">
            <SupercardStage />
          </div>
        </div>
      </section>

      {/* Fundamentals */}
      <section
        id="fundamentals"
        className="relative border-t border-border px-6 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-16 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-primary">
                {"// fundamentals"}
              </p>
              <h2 className="mt-4 max-w-[640px] text-balance text-[36px] font-medium leading-[1.05] tracking-[-0.035em] text-white sm:text-[48px]">
                The three primitives that hold a wallet together.
              </h2>
            </div>
            <p className="max-w-[420px] text-[15px] leading-6 text-white/52">
              Strip away the brand names and Supercard is a programmable control point between AI providers and AI consumers — money turns into policy, then into reward.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 [grid-template-columns:repeat(1,minmax(0,1fr))] md:[grid-template-columns:repeat(3,minmax(0,1fr))]">
            {FUNDAMENTALS.map((item) => (
              <div
                key={item.label}
                className="group relative flex flex-col gap-4 bg-background p-8 transition-colors duration-300 hover:bg-white/[0.025]"
              >
                <span className="font-mono text-[11px] tracking-[0.28em] text-primary/80">
                  {item.label}
                </span>
                <h3 className="text-[24px] font-medium leading-[1.1] tracking-[-0.02em] text-white">
                  {item.title}
                </h3>
                <p className="text-[14.5px] leading-[1.65] text-white/56">{item.body}</p>
                <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/35">
                  <span>{item.detail}</span>
                  <ArrowUpRight
                    className="size-3.5 text-white/30 transition-colors group-hover:text-white/70"
                    strokeWidth={1.6}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Money path */}
      <section className="relative border-t border-border px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-16 flex flex-col gap-4">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-primary">
              {"// money path"}
            </p>
            <h2 className="max-w-[760px] text-balance text-[36px] font-medium leading-[1.05] tracking-[-0.035em] text-white sm:text-[48px]">
              Where a dollar goes when it goes through Supercard.
            </h2>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/30 p-1.5">
            <div className="grid grid-cols-1 divide-y divide-white/8 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              {[
                { k: "user wallet", v: "$100.00", note: "prepaid balance" },
                { k: "provider cost", v: "~$82.00", note: "actual API/compute usage" },
                { k: "supercard take", v: "~$18.00", note: "spread or BYOK fee" },
                { k: "rewards minted", v: "≈ $8.00", note: "funded from take, capped" },
              ].map((row) => (
                <div key={row.k} className="flex flex-col gap-2 px-6 py-8">
                  <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">
                    {row.k}
                  </span>
                  <span className="text-[34px] font-medium tracking-[-0.03em] text-white">
                    {row.v}
                  </span>
                  <span className="text-[13px] text-white/50">{row.note}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-8 max-w-[760px] text-[14.5px] leading-[1.65] text-white/48">
            On pooled usage Supercard keeps 5–25% gross take; on BYOK it keeps a software fee instead. Rewards cost <em className="not-italic text-white">less than take</em>, so margin stays positive even at generous Bronze-tier rates.
          </p>
        </div>
      </section>

      {/* Who benefits */}
      <section className="relative border-t border-border px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-16 flex flex-col gap-4">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-primary">
              {"// who benefits"}
            </p>
            <h2 className="max-w-[760px] text-balance text-[36px] font-medium leading-[1.05] tracking-[-0.035em] text-white sm:text-[48px]">
              The market view, not the feature list.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {PROVIDER_BANDS.map((band) => (
              <div
                key={band.label}
                className="rounded-2xl border border-white/8 bg-white/[0.02] p-8 transition-colors hover:border-white/18 hover:bg-white/[0.04]"
              >
                <h3 className="text-[20px] font-medium leading-[1.1] tracking-[-0.02em] text-white">
                  {band.label}
                </h3>
                <p className="mt-5 text-[14.5px] leading-[1.65] text-white/52">
                  {band.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="relative border-t border-border px-6 py-20">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div className="max-w-[640px]">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.32em] text-primary">
              {"// partner outreach"}
            </p>
            <h3 className="mt-4 text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-white sm:text-[34px]">
              Modal, Vercel, OpenRouter, Context.dev, Exa & co. — let&apos;s talk term sheets.
            </h3>
            <p className="mt-4 text-[14.5px] leading-[1.6] text-white/50">
              Phase 1 outreach is open. We pitch volume + spread + tier distribution, not exposure.
            </p>
          </div>
          <a
            href="https://cal.com/yash-dewasthale/talk-to-founder"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-[13px] font-semibold text-black transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/90 active:scale-[0.97]"
          >
            Talk to the founder
            <ArrowUpRight className="size-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </section>

      <Footer />
    </main>
  );
}
