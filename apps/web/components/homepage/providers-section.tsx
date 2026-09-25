"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

const providers = [
  "Concentrate AI",
  "Merge",
  "OrcaRouter",
  "OpenRouter",
  "OpenAI",
  "Gemini",
  "Ollama",
  "GitHub Models",
  "DeepSeek",
  "Groq",
  "Mistral",
  "LM Studio",
  "NEAR AI",
  "Xiaomi MiMo",
  "LiteLLM",
]

const ProvidersSection = () => {
  const [visible, setVisible] = useState(false)
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
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

  return (
    <section
      ref={sectionRef}
      className="py-24 px-6 border-t border-border"
    >
      <style>{`
        @keyframes provider-enter {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes provider-enter {
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        }
      `}</style>

      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-lg font-semibold text-primary uppercase mb-4">
              {"// providers"}
            </h2>
            <h3 className="text-[28px] md:text-[36px] text-[#A1A1AA] font-medium tracking-tighter leading-[1.15]">
              bring your own model.
            </h3>
            <p className="text-sm md:text-base text-white/60 mt-3 max-w-[500px] tracking-tight">
              one agent, every backend. wire a provider once and switch models
              mid-session.
            </p>
          </div>
          <Link
            href="/docs/providers"
            className="hidden md:inline-flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-foreground transition-colors group"
          >
            <span>See all providers</span>
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {providers.map((name, i) => {
            const delay = reduceMotion ? 0 : i * 50
            return (
              <div
                key={name}
                style={
                  visible
                    ? {
                        opacity: reduceMotion ? 1 : 0,
                        transform: reduceMotion ? "translateY(0)" : "translateY(6px)",
                        animation: visible
                          ? `provider-enter 350ms cubic-bezier(0.23, 1, 0.32, 1) forwards`
                          : undefined,
                        animationDelay: `${delay}ms`,
                      }
                    : { opacity: 0, transform: "translateY(6px)" }
                }
                className="border border-border rounded-lg px-5 py-4 text-center hover:border-primary/30 transition-colors duration-200 bg-card/20 hover:bg-card/50"
              >
                <span className="text-base text-[#A1A1AA] hoverable:hover:text-foreground transition-colors duration-150">
                  {name}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/docs/providers"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>See all providers</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default ProvidersSection
