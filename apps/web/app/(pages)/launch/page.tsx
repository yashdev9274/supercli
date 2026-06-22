"use client"

import { useState, useEffect } from "react"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import Link from "next/link"

const LAUNCH_DATE = new Date("2026-06-22T19:00:00").getTime()

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
  "5 free models included",
  "bring your own API key",
  "action commands",
  "full OS access — read files, run commands, edit code, open apps, search the web",
  "persistent memory across sessions",
  "you approve every action on your command",
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

          {/* Status badge */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 border border-primary/20 rounded-full bg-primary/[0.03]">
              <span className="relative flex h-2 w-2">
                {!launched && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
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
                <span className="text-primary/30 text-[32px] sm:text-[48px] font-light leading-none -mt-4 animate-pulse">
                  :
                </span>
                <TimeUnit value={pad(time.hours)} label="hours" />
                <span className="text-primary/30 text-[32px] sm:text-[48px] font-light leading-none -mt-4 animate-pulse">
                  :
                </span>
                <TimeUnit value={pad(time.minutes)} label="mins" />
                <span className="text-primary/30 text-[32px] sm:text-[48px] font-light leading-none -mt-4 animate-pulse">
                  :
                </span>
                <TimeUnit value={pad(time.seconds)} label="secs" />
              </div>

              <div className="font-mono text-[11px] text-muted-foreground/30 uppercase tracking-[0.2em]">
                T-MINUS
              </div>
            </div>
          )}

          {launched && (
            <div className="mb-16">
              <h2 className="text-[36px] sm:text-[56px] font-bold font-mono text-primary tracking-tight leading-none mb-3">
                SUPERCODE BETA IS LIVE. <span className="inline-block animate-bounce">🎉</span>
              </h2>
              <a
                href="https://supercli.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-mono text-[15px] text-primary/70 hover:text-primary underline underline-offset-4 mb-8 transition-colors"
              >
                supercli.vercel.app ↗
              </a>
              <p className="font-mono text-[15px] text-foreground/85 leading-relaxed max-w-[600px] mx-auto mb-10">
                An open-source AI agent in your terminal that controls your whole machine.
              </p>

              {/* In beta now */}
              <div className="text-left max-w-[640px] mx-auto mb-12">
                <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-5">
                  $ cat /beta/now
                </div>
                <div className="space-y-3">
                  {betaFeatures.map((f, i) => (
                    <div key={i} className="flex items-start gap-3">
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
                    <div key={i} className="flex items-start gap-3">
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
                    className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-border/40 transition-all duration-200"
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

          {/* Launch date line */}
          {!launched && (
            <div className="font-mono text-[13px] text-muted-foreground/60 mb-16">
              launching <span className="text-primary/80 font-semibold">june 22, 2026</span> at{" "}
              <span className="text-primary/80 font-semibold">7:00 PM</span>
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

          {/* Feature specs */}
          <div className="text-left max-w-[640px] mx-auto mb-10">
            <div className="font-mono text-[11px] text-muted-foreground/40 tracking-wider uppercase mb-6">
              $ man supercode --features
            </div>
            <div className="space-y-5">
              {features.map((feature, i) => (
                <div
                  key={feature.cmd}
                  className="group border border-border/40 rounded-lg px-5 py-4 hover:border-primary/20 hover:bg-primary/[0.02] transition-all duration-300"
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
                  className="relative w-full py-4 rounded-xl font-mono text-sm font-medium text-primary-foreground block text-center transition-all duration-300 hover:shadow-[0_0_40px_-10px] hover:shadow-primary/50"
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
                <Link
                  href="/waitlist"
                  className="relative w-full py-4 rounded-xl font-mono text-sm font-medium text-primary-foreground block text-center transition-all duration-300 hover:shadow-[0_0_40px_-10px] hover:shadow-primary/50"
                  style={{
                    background: "oklch(0.7214 0.1337 49.9802)",
                  }}
                >
                  <span className="relative z-10">join the waitlist →</span>
                </Link>
                <p className="font-mono text-[11px] text-muted-foreground/30 mt-3">
                  early access starts june 22
                </p>
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
