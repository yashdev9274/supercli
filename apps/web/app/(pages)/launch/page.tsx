"use client"

import { useState, useEffect } from "react"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import Link from "next/link"

const LAUNCH_DATE = new Date("2026-07-10T00:00:00").getTime()

function getTimeRemaining(target: number) {
  const diff = Math.max(0, target - Date.now())
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
    total: diff,
  }
}

type TimeRemaining = ReturnType<typeof getTimeRemaining>

const betaFeatures = [
  "7 built-in agents — build, plan, explore, compact, title, summary, general",
  "voice control — ctrl+shift+v or /voice",
  "auto-update — always on the latest version",
  "/connect — manage providers from the CLI",
  "context window with breakdown rendering",
  "granular permissions — chat mode (read-only) / agent mode (full access)",
]

const changelog = [
  {
    heading: "New providers & models",
    items: [
      "ConcentrateAI provider integration (v0.1.13)",
      "GLM 5.2 model support (v0.1.17)",
      "MiniMax M3, GLM 5.1, Kimi K2.6 support",
    ],
  },
  {
    heading: "Agent system",
    items: [
      "Agent module with 7 built-in agents: build, plan, general, explore, compaction, title, summary — each with their own permission profiles",
      "Permission system with Ruleset types and wildcard matching",
      "Mode simplification: 4 modes → 2 (chat for read-only, agent for full access)",
      "Context window command with breakdown rendering",
    ],
  },
  {
    heading: "CLI features",
    items: [
      "/connect command — provider connection directly from CLI",
      "Auto-update feature (v0.1.21)",
      "Voice capture — Ctrl+Shift+V or /voice to speak commands",
      "Persistent stdin setup",
    ],
  },
  {
    heading: "Infrastructure",
    items: [
      "Usage tracking & analytics",
      "Prisma integration for persistent storage",
      "Device code timestamps migration",
    ],
  },
]

const comingNext = [
  "screen-actuation agent (sees your screen, hears your voice, moves your cursor)",
  "MCPs & more providers",
  "app integrations",
  "and more",
]

const features = [
  {
    cmd: "supercode --model free",
    desc: "Free models included — GPT, Gemini, Deepseek, and more out of the box.",
  },
  {
    cmd: "supercode --access full",
    desc: "Read files, run commands, edit code, open apps, search the web — full machine access from the terminal.",
  },
  {
    cmd: "supercode --permit granular",
    desc: "Every action requires your approval. Granular permissions per file, command, or tool.",
  },
  {
    cmd: "supercode --memory persistent",
    desc: "Long-term memory that persists across sessions. The agent remembers your project context.",
  },
  {
    cmd: "supercode --provider any",
    desc: "No vendor lock-in. Use free models or connect Claude, GPT, Gemini — your API key, your choice.",
  },
  {
    cmd: "supercode --control voice",
    desc: "Keyboard or voice. Control your entire development workflow without leaving the terminal.",
  },
]

export default function LaunchPage() {
  const [time, setTime] = useState<TimeRemaining | null>(null)
  const [launched, setLaunched] = useState(false)

  useEffect(() => {
    const tick = () => {
      const remaining = getTimeRemaining(LAUNCH_DATE)
      if (remaining.total <= 0) {
        setLaunched(true)
        setTime(remaining)
        return
      }
      setTime(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  const pad = (n: number) => n.toString().padStart(2, "0")

  return (
    <main className="min-h-screen bg-background dark relative flex flex-col">
      <style>{`
        :root {
          --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
          --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        }

        @keyframes pulse-soft {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }

        @keyframes ping-soft {
          0% { transform: scale(1); opacity: 0.6; }
          75%, 100% { transform: scale(2); opacity: 0; }
        }

        @keyframes pop {
          0% { transform: scale(0.8); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .feature-card {
          transition: border-color 200ms var(--ease-out), background-color 200ms var(--ease-out);
        }

        @media (hover: hover) and (pointer: fine) {
          .feature-card:hover {
            border-color: color-mix(in srgb, var(--primary) 20%, transparent);
            background-color: color-mix(in srgb, var(--primary) 2%, transparent);
          }
          .cta-btn:hover {
            box-shadow: 0 0 30px -8px color-mix(in srgb, var(--primary) 50%, transparent);
          }
        }

        .cta-btn {
          transition: transform 160ms var(--ease-out), box-shadow 200ms var(--ease-out);
        }
        .cta-btn:active {
          transform: scale(0.97);
        }

        .copy-btn {
          transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
        }
        .copy-btn:active {
          transform: scale(0.93);
        }

        .stagger-item {
          opacity: 0;
          animation: fadeUp 300ms var(--ease-out) forwards;
        }
        .stagger-item:nth-child(1) { animation-delay: 0ms; }
        .stagger-item:nth-child(2) { animation-delay: 50ms; }
        .stagger-item:nth-child(3) { animation-delay: 100ms; }
        .stagger-item:nth-child(4) { animation-delay: 150ms; }
        .stagger-item:nth-child(5) { animation-delay: 200ms; }
        .stagger-item:nth-child(6) { animation-delay: 250ms; }
        .stagger-item:nth-child(7) { animation-delay: 300ms; }
        .stagger-item:nth-child(8) { animation-delay: 350ms; }

        .colon-pulse {
          animation: pulse-soft 2s var(--ease-in-out) infinite;
        }

        .dot-ping {
          animation: ping-soft 1.5s ease-out infinite;
        }

        .emoji-pop {
          animation: pop 400ms var(--ease-out) 200ms both;
        }
      `}</style>

      {/* Side borders */}
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      {/* Hero: Countdown */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-16">
        <div className="w-full max-w-[800px] mx-auto text-center">
          {/* Breadcrumb */}
          <div className="mb-10">
            <span className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase">
              /supercode/launch
            </span>
          </div>

          {!launched && (
                <div className="mb-8">
                  <div className="font-mono text-[20px] text-muted-foreground/50 uppercase tracking-[0.15em] mb-1">
                    launching on
                  </div>
                  <div className="font-mono text-[50px] sm:text-[40px] font-bold text-primary tracking-tight leading-none mb-10">
                    Product Hunt
                  </div>
              </div>
          )}

          {/* Status badge */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 border border-primary/20 rounded-full bg-primary/[0.03]">
              <span className="relative flex h-2 w-2">
                {!launched && (
                  <span className="dot-ping absolute inline-flex h-full w-full rounded-full bg-primary" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    launched ? "bg-green-500" : "bg-primary"
                  }`}
                />
              </span>
              <span className="font-mono text-[12px] text-primary tracking-wider uppercase">
                {launched ? "Now Live" : "Countdown to Launch"}
              </span>
            </div>
          </div>

          {/* Massive countdown */}
          {time && !launched && (
            <div className="mb-8">
              
              <div
                className="flex items-center justify-center gap-3 sm:gap-5 select-none mb-4"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                <TimeUnit value={pad(time.days)} label="days" />
                <span className="text-primary/80 text-[32px] sm:text-[48px] font-light leading-none -mt-4 colon-pulse">
                  :
                </span>
                <TimeUnit value={pad(time.hours)} label="hours" />
                <span className="text-primary/80 text-[32px] sm:text-[48px] font-light leading-none -mt-4 colon-pulse">
                  :
                </span>
                <TimeUnit value={pad(time.minutes)} label="mins" />
                <span className="text-primary/80 text-[32px] sm:text-[48px] font-light leading-none -mt-4 colon-pulse">
                  :
                </span>
                <TimeUnit value={pad(time.seconds)} label="secs" />
              </div>

              <div className="font-mono text-[13px] text-muted-foreground/60">
                on july 10, 2026
              </div>
            </div>
          )}

          {launched && (
            <div className="mb-16">
              <h2 className="text-[36px] sm:text-[56px] font-bold font-mono text-primary tracking-tight leading-none mb-3">
                SUPERCODE IS ON PRODUCT HUNT. <span className="inline-block emoji-pop">🎉</span>
              </h2>
              <a
                href="https://www.producthunt.com/products/supercode?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-supercode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mb-10"
              >
                <img
                  alt="Supercode - Open-source SWE agent with full machine access | Product Hunt"
                  width="250"
                  height="54"
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1184495&amp;theme=dark&amp;t=1782838906009"
                />
              </a>
              <p className="font-mono text-[15px] text-foreground/85 leading-relaxed max-w-[600px] mx-auto mb-10">
                v0.1.30 — An open-source AI agent in your terminal that controls your whole machine.
              </p>

              {/* In beta now */}
              <div className="text-left max-w-[640px] mx-auto mb-12">
                <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-5">
                  $ cat /beta/now
                </div>
                <div className="space-y-3">
                  {betaFeatures.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 stagger-item">
                      <span className="font-mono text-[12px] text-green-500/70 shrink-0 mt-0.5">✦</span>
                      <span className="font-mono text-[14px] text-foreground/85">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coming next */}
              <div className="text-left max-w-[640px] mx-auto mb-12">
                <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-5">
                  $ cat /beta/next
                </div>
                <div className="space-y-3">
                  {comingNext.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 stagger-item">
                      <span className="font-mono text-[12px] text-primary/50 shrink-0 mt-0.5">→</span>
                      <span className="font-mono text-[14px] text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Install command */}
              <div className="max-w-[560px] mx-auto">
                <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-3">
                  $ install
                </div>
                <div className="group relative">
                  <pre className="font-mono text-[14px] bg-black/40 border border-border/40 rounded-lg px-5 py-4 text-foreground/80 overflow-x-auto">
                    <span className="text-muted-foreground/50">$</span> npm install -g supercode-cli@latest
                  </pre>
                  <button
                    onClick={() => navigator.clipboard.writeText("npm install -g supercode-cli@latest")}
                    className="copy-btn absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-border/40"
                    aria-label="Copy install command"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent mb-16" />

          {/* What is Supercode */}
          <div className="text-left max-w-[640px] mx-auto mb-16">
            <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-6">
              $ cat /supercode/about
            </div>
            <p className="font-mono text-[15px] text-foreground/85 leading-relaxed mb-4">
              Supercode is an open-source AI coding agent that runs directly in your terminal.
              It understands your entire machine — not just the file you have open.
            </p>
            <p className="font-mono text-[15px] text-muted-foreground leading-relaxed">
              Read files, run commands, edit code, open applications, search the web — all
              through natural language. Granular permissions ensure it only does what you allow.
            </p>
          </div>

          {/* What's New */}
          <div className="text-left max-w-[640px] mx-auto mb-16">
            <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-6">
              $ what's new in supercode
            </div>
            <div className="space-y-8">
              {changelog.map((group, i) => (
                <div key={i}>
                  <div className="font-mono text-[11px] text-primary/50 tracking-wider uppercase mb-3">
                    {group.heading}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item, j) => (
                      <div key={j} className="flex items-start gap-3 stagger-item">
                        <span className="font-mono text-[12px] text-green-500/70 shrink-0 mt-0.5">✦</span>
                        <span className="font-mono text-[14px] text-foreground/85 leading-relaxed">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature specs */}
          <div className="text-left max-w-[640px] mx-auto mb-10">
            <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-6">
              $ man supercode --features
            </div>
            <div className="space-y-5">
              {features.map((feature, i) => (
                <div
                  key={feature.cmd}
                  className="feature-card group border border-border/40 rounded-lg px-5 py-4 stagger-item"
                >
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-[12px] text-primary/50 mt-0.5 shrink-0 w-6 text-right">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <code className="font-mono text-[13px] text-primary font-semibold block mb-1">
                        {feature.cmd}
                      </code>
                      <p className="font-mono text-[13px] text-muted-foreground leading-relaxed">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="max-w-[420px] mx-auto mt-12">
            {launched ? (
              <>
                <Link
                  href="/docs/quickstart"
                  className="cta-btn relative w-full py-4 rounded-xl font-mono text-sm font-medium text-primary-foreground block text-center"
                  style={{
                    background: "oklch(0.7214 0.1337 49.9802)",
                  }}
                >
                  <span className="relative z-10">quickstart guide →</span>
                </Link>
                <p className="font-mono text-[11px] text-muted-foreground/30 mt-3">
                  npm install -g supercode-cli@latest
                </p>
              </>
            ) : (
              <>
                {/* <Link
                  href="/waitlist"
                  className="cta-btn relative w-full py-4 rounded-xl font-mono text-sm font-medium text-primary-foreground block text-center"
                  style={{
                    background: "oklch(0.7214 0.1337 49.9802)",
                  }}
                >
                  <span className="relative z-10">join the waitlist →</span>
                </Link> */}
                {/* <p className="font-mono text-[11px] text-muted-foreground/30 mt-3">
                  product hunt launch — july 10
                </p> */}
              </>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-1 sm:gap-2">
        {value.split("").map((digit, i) => (
          <span
            key={i}
            className="w-[36px] sm:w-[52px] text-center text-[36px] sm:text-[52px] font-mono font-bold text-primary leading-none"
            style={{ textShadow: "0 0 12px rgba(217,157,50,0.2)" }}
          >
            {digit}
          </span>
        ))}
      </div>
      <span className="font-mono text-[9px] text-muted-foreground/40 uppercase tracking-[0.15em]">
        {label}
      </span>
    </div>
  )
}
