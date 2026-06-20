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
    name: "Claude Code",
    tagline: "agentic coding by Anthropic",
    href: "https://docs.anthropic.com/en/docs/claude-code/overview",
    badge: "PRO",
    badgeColor: "text-orange-400",
  },
  {
    name: "Hermes Agent",
    tagline: "autonomous AI agent",
    href: "https://github.com/NousResearch/hermes-agent",
    badge: "OSS",
    badgeColor: "text-violet-400",
  },
  {
    name: "Warp",
    tagline: "AI-native terminal",
    href: "https://www.warp.dev",
    badge: "GUI",
    badgeColor: "text-sky-400",
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
  claude: boolean
  hermes: boolean
  warp: boolean
  cursor: boolean
}

interface CategoryDivider {
  type: "divider"
  label: string
}

type Row = CategoryDivider | FeatureRow

const rows: Row[] = [
  { type: "divider", label: "Core" },
  { type: "feature", name: "Terminal-native", supercode: true, opencode: true, claude: true, hermes: false, warp: true, cursor: false },
  { type: "feature", name: "Open source", supercode: true, opencode: true, claude: false, hermes: true, warp: false, cursor: false },
  { type: "divider", label: "Access & Control" },
  { type: "feature", name: "Full machine access", supercode: true, opencode: false, claude: false, hermes: true, warp: false, cursor: false },
  { type: "feature", name: "Granular permissions", supercode: true, opencode: false, claude: false, hermes: false, warp: false, cursor: false },
  { type: "divider", label: "Models & Data" },
  { type: "feature", name: "Free models included", supercode: true, opencode: false, claude: false, hermes: false, warp: false, cursor: true },
  { type: "feature", name: "BYO API key", supercode: true, opencode: true, claude: false, hermes: false, warp: false, cursor: true },
  { type: "feature", name: "Multi-model support", supercode: true, opencode: false, claude: false, hermes: false, warp: false, cursor: true },
  { type: "feature", name: "Persistent memory", supercode: true, opencode: false, claude: false, hermes: false, warp: false, cursor: false },
  { type: "divider", label: "Capabilities" },
  { type: "feature", name: "File editing", supercode: true, opencode: true, claude: true, hermes: true, warp: false, cursor: true },
  { type: "feature", name: "Web search", supercode: true, opencode: false, claude: false, hermes: true, warp: false, cursor: false },
  { type: "feature", name: "Voice control", supercode: true, opencode: false, claude: false, hermes: false, warp: false, cursor: false },
  { type: "feature", name: "Session history", supercode: true, opencode: true, claude: true, hermes: false, warp: true, cursor: true },
]

function CheckMark() {
  return <span className="text-primary text-[18px] leading-none font-mono">✓</span>
}

function CrossMark() {
  return <span className="text-muted-foreground/25 text-[18px] leading-none font-mono">—</span>
}

function FeatureCell({ value }: { value: boolean }) {
  return (
    <td className="py-4 text-center border-b border-border/30">
      {value ? <CheckMark /> : <CrossMark />}
    </td>
  )
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-mono text-foreground/70">{label}</span>
        <span className="text-[13px] font-mono text-muted-foreground">{value}/12</span>
      </div>
      <div className="h-[6px] bg-border/20 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${(value / 12) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
          className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
        />
      </div>
    </div>
  )
}

const scores = [
  { label: "Supercode", value: 12 },
  { label: "OpenCode", value: 5 },
  { label: "Claude Code", value: 3 },
  { label: "Hermes Agent", value: 5 },
  { label: "Warp", value: 3 },
  { label: "Cursor", value: 6 },
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
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="border border-border/30 rounded-xl p-6 bg-card/30 backdrop-blur-sm"
    >
      <div className="text-[28px] mb-2 font-mono">{icon}</div>
      <div className="text-[28px] font-semibold tracking-tight text-foreground font-mono">
        {value}
      </div>
      <div className="text-[13px] text-muted-foreground font-mono mt-1">{label}</div>
    </motion.div>
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
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block text-[12px] font-mono uppercase tracking-[0.25em] text-muted-foreground/50 mb-6">
              — Supercode v0.1.7
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
            <p className="text-[17px] text-muted-foreground font-mono max-w-[600px] leading-relaxed">
              An honest comparison. Supercode is the only terminal AI agent that gives you full machine
              control with granular permissions — no vendor lock-in, no black boxes.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats row */}
      <section className="px-6 pb-20">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="⊞" value="12/12" label="features covered" index={0} />
            <StatCard icon="⚡" value="100%" label="open source" index={1} />
            <StatCard icon="⊡" value="5+" label="models supported" index={2} />
            <StatCard icon="◈" value="0" label="vendor lock-in" index={3} />
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 pb-24">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">
              Feature comparison
            </h2>
            <p className="text-[14px] text-muted-foreground font-mono">
              Every feature that matters for a terminal AI coding agent.
            </p>
          </motion.div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-left pb-5 pr-6 w-[200px]">
                    <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground/40">
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
                              : "text-foreground/70 hover:text-foreground"
                          }`}
                        >
                          {tool.name}
                        </a>
                        <span
                          className={`text-[9px] font-mono uppercase tracking-[0.1em] ${tool.badgeColor} opacity-60`}
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
                            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground/40">
                              {row.label}
                            </span>
                            <div className="flex-1 h-px bg-border/20" />
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
                      transition={{ delay: i * 0.03, duration: 0.35 }}
                      className="group"
                    >
                      <td className="py-4 pr-6 border-b border-border/30">
                        <span className="text-[14px] font-mono text-foreground/75 group-hover:text-foreground transition-colors">
                          {row.name}
                        </span>
                      </td>
                      <td className="py-4 text-center border-b border-border/30 bg-primary/[0.02]">
                        <CheckMark />
                      </td>
                      <FeatureCell value={row.opencode} />
                      <FeatureCell value={row.claude} />
                      <FeatureCell value={row.hermes} />
                      <FeatureCell value={row.warp} />
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
            className="mb-10"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">
              At a glance
            </h2>
            <p className="text-[14px] text-muted-foreground font-mono">
              How each tool stacks up across all 12 features.
            </p>
          </motion.div>

          <div className="grid gap-5 max-w-[500px]">
            {scores.map((score) => (
              <ScoreBar key={score.label} label={score.label} value={score.value} />
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
            className="mb-12"
          >
            <h2 className="text-[13px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">
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
                title: "Zero lock-in",
                desc: "Free models included out of the box. Or bring your own API key for Claude, GPT, Gemini — whatever you prefer. Your choice, always.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="border border-border/20 rounded-xl p-7 bg-card/20"
              >
                <div className="text-[24px] mb-4 font-mono text-primary/80">{item.icon}</div>
                <h3 className="text-[17px] font-semibold mb-3 tracking-tight font-mono">
                  {item.title}
                </h3>
                <p className="text-[14px] text-muted-foreground font-mono leading-relaxed">
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
            className="border border-border/30 rounded-2xl p-12 md:p-16 text-center bg-card/20"
          >
            <h2 className="text-[32px] md:text-[44px] font-semibold tracking-tight mb-4 font-mono">
              Try{" "}
              <span className="bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                Supercode
              </span>
            </h2>
            <p className="text-[15px] text-muted-foreground font-mono max-w-[450px] mx-auto mb-8 leading-relaxed">
              Beta launches June 22. Join the waitlist for early access.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/waitlist"
                className="px-7 py-3 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium font-mono hover:opacity-90 transition-opacity"
              >
                Join waitlist
              </Link>
              <a
                href="https://github.com/yashdev9274/superCli"
                target="_blank"
                rel="noopener noreferrer"
                className="px-7 py-3 border border-border rounded-lg text-[14px] font-mono text-foreground/70 hover:text-foreground transition-colors"
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
