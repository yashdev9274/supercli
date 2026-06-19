"use client"

import { useState } from "react"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"

export default function WaitlistPage() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus("success")
        setMessage(data.message)
      } else {
        setStatus("error")
        setMessage(data.error || "Something went wrong")
      }
    } catch {
      setStatus("error")
      setMessage("Something went wrong")
    }
  }

  return (
    <main className="min-h-screen bg-[#070708] dark relative flex flex-col">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.7214 0.1337 49.9802 / 0.06) 0%, oklch(0.7214 0.1337 49.9802 / 0.02) 40%, transparent 70%)",
          }}
        />
      </div>

      <Navbar />

      <div className="flex-1 flex items-start justify-center px-6 pt-32 pb-20">
        <div className="w-full max-w-[420px]">
          {status === "success" ? (
            <div className="animate-in fade-in duration-700">
              <div className="mb-3">
                <span className="font-mono text-xs text-muted-foreground/60">
                  $ ./join --status
                </span>
              </div>
              <div className="flex items-start gap-3 mb-10">
                <span className="font-mono text-lg text-primary mt-0.5 shrink-0">
                  ✓
                </span>
                <div>
                  <p className="font-mono text-base text-foreground font-medium mb-1.5">
                    {message}
                  </p>
                  <p className="font-mono text-sm text-muted-foreground">
                    We&apos;ll notify you when Supercode CLI is ready.
                  </p>
                </div>
              </div>

              <div className="border-t border-border/50 pt-8 space-y-4">
                <span className="font-mono text-xs text-muted-foreground/60">
                  $ ./contribute
                </span>
                <p className="font-mono text-sm text-foreground">
                  Star us on GitHub and help shape the project.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <a
                    href="https://github.com/yashdev9274/superCli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-mono text-sm hover:bg-primary/15 transition-all duration-300"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.912.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    Star on GitHub
                  </a>
                  <a
                    href="https://github.com/yashdev9274/superCli/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    open an issue →
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-11 mt-34">
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-700">
                <div className="font-mono text-xs text-muted-foreground/60 tracking-wider uppercase mb-5">
                  /supercode/waitlist
                </div>

                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-xl text-primary leading-none mt-1 shrink-0">
                      &gt;_
                    </span>
                    <div>
                      <h1 className="font-mono text-[32px] md:text-[38px] font-bold tracking-tighter leading-[1.1] text-foreground">
                        Join the<br />
                        waitlist
                      </h1>
                    </div>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground leading-relaxed pl-9">
                    Be the first to run an AI coding agent
                    <br />
                    directly in your terminal.
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150"
              >
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground/50 pointer-events-none select-none">
                    →
                  </span>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-3.5 bg-transparent border border-border/60 rounded-xl font-mono text-sm text-foreground placeholder:text-muted-foreground/30 outline-none transition-all duration-300 focus:border-primary/50 focus:shadow-[0_0_24px_-12px] focus:shadow-primary/30"
                  />
                </div>

                <input
                  type="text"
                  placeholder="your name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3.5 bg-transparent border border-border/60 rounded-xl font-mono text-sm text-foreground placeholder:text-muted-foreground/30 outline-none transition-all duration-300 focus:border-primary/50 focus:shadow-[0_0_24px_-12px] focus:shadow-primary/30"
                />

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="relative w-full py-3.5 rounded-xl font-mono text-sm font-medium text-primary-foreground overflow-hidden transition-all duration-300 hover:shadow-[0_0_32px_-10px] hover:shadow-primary/40 disabled:opacity-40 disabled:hover:shadow-none"
                  style={{
                    background: "oklch(0.7214 0.1337 49.9802)",
                  }}
                >
                  <span className="relative z-10">
                    {status === "loading" ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/70 animate-pulse" />
                        processing
                      </span>
                    ) : (
                      "join waitlist →"
                    )}
                  </span>
                </button>

                {status === "error" && (
                  <p className="font-mono text-xs text-red-500 text-center pt-1">
                    {message}
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
