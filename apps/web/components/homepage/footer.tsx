"use client"

import React from "react"
import Link from "next/link"
import { Github, Twitter, Mail, ArrowUpRight } from "lucide-react"
import { motion } from "framer-motion"

const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001/docs/intro"

const PIXEL_FONT: Record<string, number[][]> = {
  S: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  U: [
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  P: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
  ],
  E: [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  R: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 1, 0, 0],
    [1, 0, 0, 1, 0],
    [1, 0, 0, 0, 1],
  ],
  C: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  O: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  D: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
}

const PIXEL_SIZE = 8
const PIXEL_GAP = 1

const PixelLogo = () => {
  const [hoverTick, setHoverTick] = React.useState(0)

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setHoverTick((t) => t + 1)}
      style={{
        filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.3))",
      }}
    >
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.3) 1px, rgba(0,0,0,0.3) 2px)",
          backgroundSize: `100% ${PIXEL_SIZE + PIXEL_GAP}px`,
        }}
      />
      <div className="flex gap-[3px]">
        {"SUPERCODE".split("").map((char, ci) => (
          <div
            key={`${hoverTick}-${ci}`}
            className="grid"
            style={{
              gridTemplateRows: `repeat(7, ${PIXEL_SIZE}px)`,
              gap: `${PIXEL_GAP}px`,
            }}
          >
            {PIXEL_FONT[char].map((row, ri) => (
              <div
                key={ri}
                className="flex"
                style={{ gap: `${PIXEL_GAP}px` }}
              >
                {row.map((pixel, pi) => (
                  <div
                    key={`${ri}-${pi}`}
                    className={`${pixel ? "bg-primary" : "bg-transparent"}`}
                    style={{
                      width: PIXEL_SIZE,
                      height: PIXEL_SIZE,
                      opacity: pixel ? undefined : 0,
                      borderRadius: "1px",
                      animation: pixel ? `pixelFadeIn 0.4s ease-out ${(ri * 5 + pi) * 20 + ci * 120}ms both` : undefined,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes pixelFadeIn {
          0% {
            opacity: 0;
            transform: scale(0.3);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}

const linkVariants = {
  hidden: { opacity: 0, x: -6 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.3 + i * 0.04, duration: 0.3, ease: "easeOut" as const },
  }),
}

interface LinkGroupProps {
  title: string
  links: { label: string; href: string; external?: boolean }[]
}

const LinkGroup = ({ title, links }: LinkGroupProps) => (
  <div>
    <h3 className="text-[11px] font-mono text-primary uppercase tracking-[0.15em] mb-5">
      $ {title}
    </h3>
    <ul className="space-y-3">
      {links.map((link, i) => (
        <motion.li
          key={link.label}
          custom={i}
          variants={linkVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {link.external ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-[13px] font-mono text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              <span className="w-0 group-hover:w-3 h-px bg-primary transition-all duration-200" />
              <span>{link.label}</span>
              <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-1 group-hover:opacity-60 group-hover:translate-y-0 transition-all duration-200" />
            </a>
          ) : (
            <Link
              href={link.href}
              className="group inline-flex items-center gap-2 text-[13px] font-mono text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              <span className="w-0 group-hover:w-3 h-px bg-primary transition-all duration-200" />
              <span>{link.label}</span>
            </Link>
          )}
        </motion.li>
      ))}
    </ul>
  </div>
)

const Footer = () => {
  return (
    <footer className="relative border-t border-border overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative max-w-[1200px] mx-auto px-6 md:px-12 pt-20 pb-6">
        {/* Wordmark wrap — Supermemory-inspired */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mb-16"
        >
          <div className="flex flex-col items-center">
            <a
              href="#top"
              aria-label="Supercode"
              className="mb-5 inline-block"
            >
              <PixelLogo />
            </a>
          </div>
        </motion.div>

        {/* 4-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 mb-16">
          <LinkGroup
            title="Product"
            links={[
              { label: "Features", href: "/#features" },
              { label: "Docs", href: DOCS_URL, external: true },
              { label: "CLI", href: "/", external: true },
              { label: "Pricing", href: "/pricing" },
              { label: "Changelog", href: "/changelog" },
              { label: "Partnerships", href: "/partnerships" },
              { label: "Launch", href: "/launch" },

            ]}
          />
          <LinkGroup
            title="Resources"
            links={[
              { label: "Documentation", href: DOCS_URL, external: true },
              { label: "GitHub", href: "https://github.com/yashdev9274/superCli", external: true },
              { label: "API Reference", href: DOCS_URL, external: true },
              { label: "System Status", href: "/#system-status" },
            ]}
          />
          <LinkGroup
            title="Compare"
            links={[
              { label: "vs Cursor", href: "/compare" },
              { label: "vs OpenCode", href: "/compare" },
              { label: "vs Claude Code", href: "/compare" },
              { label: "vs CommandCode", href: "/compare" },
              { label: "vs FreeBuff", href: "/compare" },
            ]}
          />
          <LinkGroup
            title="Company"
            links={[
              { label: "About", href: "/#about" },
              { label: "Brand", href: "/brand" },
              { label: "Contact", href: "/contact" },
              { label: "Blog", href: "/#blog" },
              { label: "Privacy", href: "/#privacy" },
              { label: "Terms", href: "/#terms" },
            ]}
          />
        </div>

        {/* Social links */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="flex justify-center gap-8 mb-12"
        >
          <a
            href="https://github.com/yashdev9274/superCli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/60 hover:text-foreground transition-colors duration-200"
          >
            <Github className="w-[18px] h-[18px]" />
          </a>
          <a
            href="https://x.com/supercodeai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/60 hover:text-foreground transition-colors duration-200"
          >
            <Twitter className="w-[18px] h-[18px]" />
          </a>
          <a
            href="mailto:yashdev.yvd@gmail.com"
            className="text-muted-foreground/60 hover:text-foreground transition-colors duration-200"
          >
            <Mail className="w-[18px] h-[18px]" />
          </a>
        </motion.div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[11px] font-mono text-muted-foreground/40 tracking-[0.05em]">
            © 2026 SUPERCODE INC.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-[11px] font-mono text-muted-foreground/20">
              v0.1.83-beta
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
