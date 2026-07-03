"use client"

import { useState, useEffect, useRef } from "react"
import { Copy, Check } from "lucide-react"

type CommandLine =
  | { type: "comment"; text: string }
  | { type: "command"; text: string; highlight?: string }
  | { type: "info"; text: string }

const commands: CommandLine[] = [
  { type: "comment", text: "installation" },
  { type: "command", text: "npm install -g supercode-cli@latest", highlight: "supercode-cli" },
  { type: "comment", text: "authentication" },
  { type: "command", text: "supercode login" },
  { type: "info", text: "(login with GitHub and verify your acc)" },
  { type: "comment", text: "scaffold your project" },
  { type: "command", text: "supercode init" },
  { type: "info", text: "start shipping with supercode" },
]

const reduceMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false

const GetStartedSection = () => {
  const [visible, setVisible] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const staggerStyle = (index: number) => {
    if (reduceMotion || !visible) return {}
    return {
      opacity: 0,
      transform: "translateY(6px)",
      animation: `terminal-enter 350ms var(--ease-out) forwards`,
      animationDelay: `${index * 60}ms`,
    }
  }

  return (
    <section
      ref={sectionRef}
      className="py-24 px-6 border-t border-border"
    >
      <style>{`
        @keyframes terminal-enter {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes terminal-enter {
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        }
      `}</style>

      <div className="max-w-[1100px] mx-auto">
        <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-6">
          $ Get started with Supercode
        </h2>

        <div className="bg-black/60 border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-black/40 border-b border-border">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-3 text-[12px] text-muted-foreground font-mono">
              supercode.sh
            </span>
          </div>

          <div className="p-5 md:p-6 font-mono text-[13px] md:text-[14px] leading-relaxed space-y-1">
            {commands.map((cmd, i) => (
              <div key={i} style={staggerStyle(i)}>
                {cmd.type === "comment" && (
                  <div className={`text-muted-foreground ${i > 0 ? "pt-2" : ""}`}>
                    # {cmd.text}
                  </div>
                )}

                {cmd.type === "command" && (
                  <div className="flex items-center justify-between group rounded-[4px] transition-colors duration-200 ease-out">
                    <span>
                      <span className="text-green-400">&gt;</span>{" "}
                      {cmd.highlight ? (
                        <>
                          <span className="text-foreground">
                            {cmd.text.split(cmd.highlight)[0]}
                          </span>
                          <span className="text-primary font-semibold">
                            {cmd.highlight}
                          </span>
                          <span className="text-foreground">
                            {cmd.text.split(cmd.highlight)[1] ?? ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-foreground">{cmd.text}</span>
                      )}
                    </span>
                    <button
                      onClick={() => handleCopy(cmd.text, i)}
                      className="ml-4 p-1 rounded-[4px] text-muted-foreground opacity-0 group-hover:opacity-100 hoverable:group-hover:opacity-100 transition-opacity duration-150 ease-out active:scale-[0.93]"
                    >
                      {copiedIndex === i ? (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {cmd.type === "info" && (
                  <div className="pl-4 text-muted-foreground">
                    {cmd.text}
                  </div>
                )}
              </div>
            ))}

            <div
              style={{
                ...(reduceMotion || !visible ? {} : {
                  opacity: 0,
                  animation: `terminal-enter 350ms var(--ease-out) forwards`,
                  animationDelay: `${commands.length * 60}ms`,
                })
              }}
              className="flex items-center gap-1 pt-1"
            >
              <span className="text-green-400">&gt;</span>
              <span className="w-2 h-4 bg-foreground/70 animate-cursor-blink" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default GetStartedSection
