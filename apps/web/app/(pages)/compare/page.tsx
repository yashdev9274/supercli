"use client"

import { motion } from "framer-motion"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import Link from "next/link"

const tools = [
  {
    name: "Supercode",
    tagline: "your AI co-pilot, your rules",
    href: "/",
    badge: "",
    badgeColor: "text-primary",
  },
  {
    name: "OpenCode",
    tagline: "terminal coding agent",
    href: "https://github.com/sst/opencode",
    badge: "OSS",
    badgeColor: "text-emerald-400",
  },
  {
    name: "CommandCode",
    tagline: "taste-learning agent",
    href: "https://commandcode.ai",
    badge: "PRO",
    badgeColor: "text-orange-400",
  },
  {
    name: "FreeBuff",
    tagline: "free ad-supported agent",
    href: "https://freebuff.com",
    badge: "FREE",
    badgeColor: "text-sky-400",
  },
  {
    name: "Claude Code",
    tagline: "agentic coding by Anthropic",
    href: "https://docs.anthropic.com/en/docs/claude-code/overview",
    badge: "PRO",
    badgeColor: "text-orange-400",
  },
  {
    name: "Cursor",
    tagline: "AI code editor",
    href: "https://cursor.com",
    badge: "GUI",
    badgeColor: "text-indigo-400",
  },
]

interface FeatureRow {
  type: "feature"
  name: string
  supercode: boolean
  opencode: boolean
  commandcode: boolean
  freebuff: boolean
  claude: boolean
  cursor: boolean
}

interface CategoryDivider {
  type: "divider"
  label: string
}

type Row = CategoryDivider | FeatureRow

const rows: Row[] = [
  { type: "divider", label: "Core" },
  { type: "feature", name: "Terminal-native", supercode: true, opencode: true, commandcode: true, freebuff: true, claude: true, cursor: false },
  { type: "feature", name: "Open source", supercode: true, opencode: true, commandcode: false, freebuff: true, claude: false, cursor: false },
  { type: "divider", label: "Pricing" },
  { type: "feature", name: "Free to start ($0)", supercode: true, opencode: true, commandcode: false, freebuff: true, claude: false, cursor: true },
  { type: "feature", name: "Free BYOK", supercode: true, opencode: true, commandcode: false, freebuff: false, claude: false, cursor: false },
  { type: "feature", name: "Free open models", supercode: true, opencode: true, commandcode: true, freebuff: true, claude: false, cursor: true },
  { type: "divider", label: "Access & Control" },
  { type: "feature", name: "Full machine access", supercode: true, opencode: false, commandcode: true, freebuff: true, claude: true, cursor: false },
  { type: "feature", name: "Granular permissions", supercode: true, opencode: false, commandcode: false, freebuff: false, claude: false, cursor: false },
  { type: "divider", label: "Models & Data" },
  { type: "feature", name: "Multi-model support", supercode: true, opencode: true, commandcode: true, freebuff: true, claude: false, cursor: true },
  { type: "feature", name: "Persistent memory", supercode: true, opencode: true, commandcode: true, freebuff: false, claude: true, cursor: true },
  { type: "feature", name: "Local model support", supercode: false, opencode: true, commandcode: false, freebuff: false, claude: false, cursor: false },
  { type: "divider", label: "Capabilities" },
  { type: "feature", name: "Web search", supercode: true, opencode: true, commandcode: true, freebuff: true, claude: true, cursor: false },
  { type: "feature", name: "Voice control", supercode: true, opencode: false, commandcode: false, freebuff: false, claude: false, cursor: false },
  { type: "feature", name: "PR review", supercode: false, opencode: false, commandcode: true, freebuff: true, claude: true, cursor: false },
]

const pricingRows = [
  { feature: "Entry price", supercode: "$0", opencode: "$0 BYOK", commandcode: "$1/mo Go", freebuff: "$0 (ads)", claude: "$20/mo Pro", cursor: "$0 Hobby" },
  { feature: "Free open models", supercode: "Included", opencode: "Limited", commandcode: "On Go plan", freebuff: "Always free", claude: "—", cursor: "Limited" },
  { feature: "Premium models", supercode: "BYOK (any)", opencode: "$10/mo Go or BYOK", commandcode: "$15/mo+ Pro", freebuff: "Pro $100–500", claude: "Included", cursor: "$20/mo Pro" },
  { feature: "Team pricing", supercode: "$0 (BYOK)", opencode: "—", commandcode: "$40/seat", freebuff: "$100–500/seat", claude: "$100–200/mo", cursor: "$40/seat" },
  { feature: "Free in India?", supercode: "✓", opencode: "✓", commandcode: "✓", freebuff: "✗", claude: "✓", cursor: "✓" },
]

function CheckMark() {
  return <span className="text-primary text-[18px] leading-none font-mono">✓</span>
}

function CrossMark() {
  return <span className="text-muted-foreground/40 text-[18px] leading-none font-mono">—</span>
}

function FeatureCell({ value }: { value: boolean }) {
  return (
    <td className="py-4 text-center border-b border-border/40">
      {value ? <CheckMark /> : <CrossMark />}
    </td>
  )
}

function ScoreBar({ value, label, index }: { value: number; label: string; index: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-mono text-foreground/70">{label}</span>
        <span className="text-[13px] font-mono text-foreground/60">{value}/13</span>
      </div>
      <div className="h-[6px] bg-border/20 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${(value / 13) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay: 0.15 + index * 0.08 }}
          className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
        />
      </div>
    </div>
  )
}

const scores = [
  { label: "Supercode", value: 11 },
  { label: "OpenCode", value: 9 },
  { label: "FreeBuff", value: 8 },
  { label: "CommandCode", value: 7 },
  { label: "Claude Code", value: 5 },
  { label: "Cursor", value: 5 },
]

function StatCard({
  icon,
  value,
  label,
  index,
}: {
  icon: string
  value: string
  label: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="border border-border/40 rounded-xl p-6 bg-card/50 backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-200 ease-out"
    >
      <div className="text-[28px] mb-2 font-mono">{icon}</div>
      <div className="text-[28px] font-semibold tracking-tight text-foreground font-mono">
        {value}
      </div>
      <div className="text-[13px] text-foreground/70 font-mono mt-1">{label}</div>
    </motion.div>
  )
}

function PricingCell({ value, highlight }: { value: string; highlight?: boolean }) {
  return (
    <td className={`py-4 px-3 text-center border-b border-border/40 text-[13px] font-mono leading-relaxed ${highlight ? "text-primary" : "text-foreground/85"}`}>
      {value}
    </td>
  )
}

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      {/* Hero */}
      <section className="pt-[140px] pb-16 px-6">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="inline-block text-[12px] font-mono uppercase tracking-[0.25em] text-primary mb-6">
              $ Supercode v0.1.14
            </span>
            <h1 className="text-[48px] md:text-[72px] font-semibold tracking-tight leading-[1.05] mb-6">
              <span className="inline-flex items-baseline gap-1">
                <span className="bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                  Supercode
                </span>
                <span className="inline-block w-[3px] h-[0.7em] bg-primary animate-cursor-blink align-middle" />
              </span>
              <br />
              vs the rest
            </h1>
            <p className="text-[17px] text-foreground/70 font-mono max-w-[600px] leading-relaxed">
              An honest comparison. Supercode is the only terminal AI agent that gives you full machine
              control with granular permissions and zero vendor lock-in — free, open source, always.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats row */}
      <section className="px-6 pb-20">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="⊞" value="11/13" label="features covered" index={0} />
            <StatCard icon="⚡" value="100%" label="open source" index={1} />
            <StatCard icon="⊡" value="5+" label="models supported" index={2} />
            <StatCard icon="◈" value="$0" label="to get started" index={3} />
          </div>
        </div>
      </section>

      {/* Pricing comparison */}
      <section className="px-6 pb-24">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="mb-8"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-primary mb-1">
              Pricing comparison
            </h2>
            <p className="text-[14px] text-foreground/70 font-mono">
              What it actually costs to use each tool.
            </p>
          </motion.div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-left pb-5 pr-6 w-[180px]">
                    <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-foreground/70">
                      &nbsp;
                    </span>
                  </th>
                  {tools.map((tool) => (
                    <th key={tool.name} className="pb-5 text-center px-3">
                      <div className="flex flex-col items-center gap-1">
                        <a
                          href={tool.href}
                          target={tool.href.startsWith("http") ? "_blank" : undefined}
                          rel={tool.href.startsWith("http") ? "noopener noreferrer" : undefined}
                          className={`text-[13px] font-mono font-medium transition-colors ${
                            tool.name === "Supercode"
                              ? "text-primary"
                              : "text-foreground/85 hover:text-foreground"
                          }`}
                        >
                          {tool.name}
                        </a>
                        <span
                          className={`text-[9px] font-mono uppercase tracking-[0.1em] ${tool.badgeColor} opacity-80`}
                        >
                          {tool.badge}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pricingRows.map((row, i) => (
                  <motion.tr
                    key={row.feature}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                    className="group"
                  >
                    <td className="py-4 pr-6 border-b border-border/40">
                      <span className="text-[14px] font-mono text-foreground/85 group-hover:text-foreground transition-colors">
                        {row.feature}
                      </span>
                    </td>
                    <PricingCell value={row.supercode} highlight />
                    <PricingCell value={row.opencode} />
                    <PricingCell value={row.commandcode} />
                    <PricingCell value={row.freebuff} />
                    <PricingCell value={row.claude} />
                    <PricingCell value={row.cursor} />
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Feature comparison */}
      <section className="px-6 pb-24">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="mb-8"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-primary mb-1">
              Feature comparison
            </h2>
            <p className="text-[14px] text-foreground/70 font-mono">
              Every feature that matters for a terminal AI coding agent.
            </p>
          </motion.div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-left pb-5 pr-6 w-[200px]">
                    <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-white">
                      Feature
                    </span>
                  </th>
                  {tools.map((tool) => (
                    <th key={tool.name} className="pb-5 text-center px-3">
                      <div className="flex flex-col items-center gap-1">
                        <a
                          href={tool.href}
                          target={tool.href.startsWith("http") ? "_blank" : undefined}
                          rel={tool.href.startsWith("http") ? "noopener noreferrer" : undefined}
                          className={`text-[13px] font-mono font-medium transition-colors ${
                            tool.name === "Supercode"
                              ? "text-primary"
                              : "text-foreground/85 hover:text-foreground"
                          }`}
                        >
                          {tool.name}
                        </a>
                        <span
                          className={`text-[9px] font-mono uppercase tracking-[0.1em] ${tool.badgeColor} opacity-80`}
                        >
                          {tool.badge}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  if (row.type === "divider") {
                    return (
                      <tr key={row.label}>
                        <td colSpan={7} className="pt-8 pb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white">
                              {row.label}
                            </span>
                            <div className="flex-1 h-px bg-border/30" />
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <motion.tr
                      key={row.name}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.03, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                      className="group"
                    >
                      <td className="py-4 pr-6 border-b border-border/40">
                        <span className="text-[14px] font-mono text-foreground/85 group-hover:text-foreground transition-colors">
                          {row.name}
                        </span>
                      </td>
                      <td className="py-4 text-center border-b border-border/40 bg-primary/[0.05]">
                        <CheckMark />
                      </td>
                      <FeatureCell value={row.opencode} />
                      <FeatureCell value={row.commandcode} />
                      <FeatureCell value={row.freebuff} />
                      <FeatureCell value={row.claude} />
                      <FeatureCell value={row.cursor} />
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Score bars */}
      <section className="px-6 pb-24">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="mb-10"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-foreground mb-1">
              At a glance
            </h2>
            <p className="text-[14px] text-foreground/70 font-mono">
              How each tool stacks up across all 13 features.
            </p>
          </motion.div>

          <div className="grid gap-5 max-w-[500px]">
            {scores.map((score, i) => (
              <ScoreBar key={score.label} label={score.label} value={score.value} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* What makes supercode different */}
      <section className="px-6 pb-24">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="mb-12"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-foreground mb-1">
              The difference
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: "◈",
                title: "Full machine control",
                desc: "Not just your editor tab. Supercode reads files, runs commands, edits code, opens apps, and searches the web — all from the terminal.",
              },
              {
                icon: "⊡",
                title: "You approve every action",
                desc: "Granular permissions per file, command, or tool. Nothing happens without your say-so. No black-box agent running wild.",
              },
              {
                icon: "⊞",
                title: "Zero lock-in, zero cost",
                desc: "Free models included out of the box. Or bring your own API key for Claude, GPT, Gemini — whatever you prefer. Always free, always open.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                className="border border-border/30 rounded-xl p-7 bg-card/50"
              >
                <div className="text-[24px] mb-4 font-mono text-primary">{item.icon}</div>
                <h3 className="text-[17px] font-semibold mb-3 tracking-tight font-mono">
                  {item.title}
                </h3>
                <p className="text-[14px] text-foreground/70 font-mono leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-32">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="border border-border/40 rounded-2xl p-12 md:p-16 text-center bg-card/50"
          >
            <h2 className="text-[32px] md:text-[44px] font-semibold tracking-tight mb-4 font-mono">
              Try{" "}
              <span className="bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                Supercode
              </span>
            </h2>
            <p className="text-[15px] text-foreground/70 font-mono max-w-[450px] mx-auto mb-8 leading-relaxed">
              Free and open source. Bring your own API key or use our built-in models. No credit card needed.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/login"
                className="px-7 py-3 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium font-mono hover:opacity-90 active:scale-[0.97] transition-all duration-150 ease-out"
              >
                Get started free
              </Link>
              <a
                href="https://github.com/yashdev9274/superCli"
                target="_blank"
                rel="noopener noreferrer"
                className="px-7 py-3 border border-border rounded-lg text-[14px] font-mono text-foreground/85 hover:text-foreground active:scale-[0.97] transition-all duration-150 ease-out"
              >
                View on GitHub
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
