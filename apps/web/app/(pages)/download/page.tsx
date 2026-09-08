"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Copy, Apple, Download } from "lucide-react"

import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import { resolveDesktopDownload } from "@/lib/desktop-download"

const installCommands: Array<{ label: string; cmd: string }> = [
  { label: "curl", cmd: 'curl -fsSL https://supercli.vercel.app/install | bash' },
  { label: "npm", cmd: "npm i -g supercode-cli" },
  { label: "bun", cmd: "bun add -g supercode-cli" },
  { label: "brew", cmd: "brew install supercode" },
]

const desktopDownload = resolveDesktopDownload(process.env.NEXT_PUBLIC_DESKTOP_DMG_URL)

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="shrink-0 p-1.5 rounded-md hover:bg-white/5 transition-colors text-zinc-500 hover:text-zinc-300"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

function InstallCommand({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div className="flex items-center gap-9 px-4 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 font-mono text-sm group hover:border-zinc-700 transition-colors">
      <span className="text-zinc-500 shrink-0 text-xs w-6">[{label}]</span>
      <code className="flex-1 text-zinc-300 truncate">{cmd}</code>
      <CopyButton text={cmd} />
    </div>
  )
}

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-background dark relative mt-30">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <div className="pt-[140px] pb-24 px-6 max-w-[800px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="text-center mb-16"
        >
          <h1 className="text-[40px] md:text-[56px] font-semibold tracking-tight mb-4">
            Download Supercode
          </h1>
          <p className="text-muted-foreground text-[17px] max-w-[500px] mx-auto">
            Available in Beta for macOS, Windows, and Linux
          </p>
        </motion.div>

        <section className="mb-20">
          <h2 className="text-sm font-mono mb-5 text-zinc-500 uppercase tracking-wider mb-4">
            [1] Supercode Terminal
          </h2>
          <div className="space-y-2">
            {installCommands.map((cmd) => (
              <motion.div
                key={cmd.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                <InstallCommand {...cmd} />
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mb-20" aria-labelledby="desktop-heading">
          <h2 id="desktop-heading" className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-4">
            [2] Supercode Desktop
          </h2>
          <div className="max-w-[400px]">
            <h3 className="mb-3 text-lg text-muted-foreground">Mac</h3>
            <div className="overflow-hidden rounded-md border border-foreground/60 bg-foreground/80 text-background divide-y divide-background/20">
              {["Apple Silicon", "Intel"].map((architecture) => {
                const content = (
                  <>
                    <Apple className="size-4 shrink-0 fill-current" aria-hidden="true" />
                    <span className="font-medium">Mac</span>
                    <span className="text-background/80">{architecture}</span>
                    {architecture === "Apple Silicon" ? (
                      <span className="rounded-sm bg-background/15 px-1.5 py-0.5 font-mono text-[10px] sm:text-xs">
                        Recommended
                      </span>
                    ) : null}
                    <Download className="ml-auto size-[18px] shrink-0" aria-hidden="true" />
                  </>
                )
                const className = "flex min-h-[54px] w-full items-center gap-2 px-3 text-sm sm:gap-3 sm:px-5 sm:text-base transition-colors hover:bg-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-background disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                return desktopDownload ? (
                  <a
                    key={architecture}
                    href={desktopDownload.url}
                    aria-label={`Download Supercode for Mac ${architecture} (.dmg)`}
                    className={className}
                  >
                    {content}
                  </a>
                ) : (
                  <button key={architecture} disabled className={className} aria-label={`Supercode for Mac ${architecture} — coming soon`}>
                    {content}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              macOS 14+ · Both options download the same universal .dmg.
            </p>
            {desktopDownload ? (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  v{desktopDownload.version} · <a href={desktopDownload.checksumUrl} className="underline underline-offset-4">SHA-256 checksum</a>
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Open the DMG, drag Supercode into Applications, then launch and sign in.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Coming soon — downloads will be enabled after release verification.</p>
            )}
          </div>
        </section>

        {/* <section className="mb-20">
          <h2 className="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-4">
            [2] Desktop (Beta)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {platforms.map((platform, i) => (
              <motion.div
                key={`${platform.name}-${platform.arch}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06, ease: [0.23, 1, 0.32, 1] }}
              >
                <button className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all text-left group">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 transition-colors shrink-0">
                    {platform.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-zinc-200">{platform.name}</div>
                    <div className="text-[12px] text-zinc-500 font-mono">{platform.arch}</div>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-600 shrink-0 px-2 py-0.5 rounded bg-zinc-800/50">
                    {platform.badge}
                  </span>
                </button>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-4">
            [3] Extensions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {extensions.map((ext, i) => (
              <motion.div
                key={ext.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] }}
              >
                <a
                  href={ext.href}
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all group"
                >
                  <span className="text-[15px] text-zinc-300 group-hover:text-white transition-colors">
                    {ext.name}
                  </span>
                  <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </a>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-4">
            [4] Integrations
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {integrations.map((int, i) => (
              <motion.div
                key={int.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: [0.23, 1, 0.32, 1] }}
              >
                <a
                  href={int.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all group"
                >
                  <span className="text-[15px] text-zinc-300 group-hover:text-white transition-colors">
                    {int.name}
                  </span>
                  <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </a>
              </motion.div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-6">
            FAQ
          </h2>
          <div className="space-y-4">
            {[
              { q: "What is Supercode?", a: "Supercode is an open-source SWE agent that works directly in your codebase. Build, debug, and ship from your terminal, IDE, Slack, or the web." },
              { q: "How do I use Supercode?", a: "After installing, run supercode in your terminal. Use supercode init to get started, or supercode --help to see all commands." },
              { q: "Do I need extra AI subscriptions?", a: "No. Supercode works with your own API keys (BYOK) for any model provider. You only pay for what you use." },
              { q: "Can I only use Supercode in the terminal?", a: "No. Supercode also integrates with VS Code, Cursor, Zed, and other IDEs, plus GitHub and Slack." },
              { q: "How much does Supercode cost?", a: "Supercode is free and open source. You bring your own API keys for model access." },
              { q: "Is Supercode open source?", a: "Yes. Supercode is fully open source under the MIT license." },
            ].map((faq, i) => (
              <details
                key={i}
                className="group [&[open]>summary_.chevron]:rotate-180"
              >
                <summary className="flex items-center justify-between py-3 cursor-pointer text-[15px] text-zinc-300 hover:text-white transition-colors list-none">
                  {faq.q}
                  <svg className="chevron w-4 h-4 text-zinc-600 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p className="pb-3 text-[14px] text-zinc-500 leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section> */}
      </div>

      <Footer />
    </main>
  )
}
