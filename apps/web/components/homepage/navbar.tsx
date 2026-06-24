"use client"

import React, { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import BetaCountdownBanner from "./beta-countdown-banner"

const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:3001/docs/intro"

function GithubStars() {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    fetch("https://api.github.com/repos/yashdev9274/superCli")
      .then((res) => res.json())
      .then((data) => setStars(data.stargazers_count))
      .catch(() => {})
  }, [])

  if (stars === null) return null

  return (
    <span className="ml-1.5 text-[15px] text-muted-foreground/60 font-mono">
      [{stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}]
    </span>
  )
}

const PixelLogo = () => (
  <svg
    width="140"
    height="18"
    viewBox="0 0 140 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {[
      { g: "s", blocks: "0,0:3,0:6,0 | 0,3:0,6 | 3,6:6,6 | 6,9 | 0,12:3,12:6,12" },
      { g: "u", blocks: "12,0:18,0 | 12,3:18,3 | 12,6:18,6 | 12,9:18,9 | 15,12 | 18,12" },
      { g: "p", blocks: "24,0:27,0:30,0 | 24,3:30,3 | 24,6:27,0:30,6 | 24,9 | 24,12" },
      { g: "e", blocks: "36,0:39,0:42,0 | 36,3 | 36,6:39,6 | 36,9 | 36,12:39,12:42,12" },
      { g: "r", blocks: "48,0:51,0:54,0 | 48,3:54,3 | 48,6:51,6:54,6 | 48,9:51,9 | 48,12:54,12" },
    ].map(() => null)}
    <rect x="0" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="3" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="6" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="0" y="3" width="3" height="3" fill="#71717a" />
    <rect x="0" y="6" width="3" height="3" fill="#71717a" />
    <rect x="3" y="6" width="3" height="3" fill="#71717a" />
    <rect x="6" y="6" width="3" height="3" fill="#71717a" />
    <rect x="6" y="9" width="3" height="3" fill="#52525b" />
    <rect x="0" y="12" width="3" height="3" fill="#52525b" />
    <rect x="3" y="12" width="3" height="3" fill="#52525b" />
    <rect x="6" y="12" width="3" height="3" fill="#52525b" />
    <rect x="12" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="18" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="12" y="3" width="3" height="3" fill="#71717a" />
    <rect x="18" y="3" width="3" height="3" fill="#71717a" />
    <rect x="12" y="6" width="3" height="3" fill="#71717a" />
    <rect x="18" y="6" width="3" height="3" fill="#71717a" />
    <rect x="12" y="9" width="3" height="3" fill="#52525b" />
    <rect x="18" y="9" width="3" height="3" fill="#52525b" />
    <rect x="12" y="12" width="3" height="3" fill="#52525b" />
    <rect x="15" y="12" width="3" height="3" fill="#52525b" />
    <rect x="18" y="12" width="3" height="3" fill="#52525b" />
    <rect x="24" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="27" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="30" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="36" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="39" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="42" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="48" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="51" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="54" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="62" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="65" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="68" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="74" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="77" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="80" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="86" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="89" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="92" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="98" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="101" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="104" y="0" width="3" height="3" fill="#a1a1aa" />
    <rect x="24" y="3" width="3" height="3" fill="#71717a" />
    <rect x="30" y="3" width="3" height="3" fill="#71717a" />
    <rect x="36" y="3" width="3" height="3" fill="#71717a" />
    <rect x="48" y="3" width="3" height="3" fill="#71717a" />
    <rect x="54" y="3" width="3" height="3" fill="#71717a" />
    <rect x="62" y="3" width="3" height="3" fill="#71717a" />
    <rect x="74" y="3" width="3" height="3" fill="#71717a" />
    <rect x="80" y="3" width="3" height="3" fill="#71717a" />
    <rect x="86" y="3" width="3" height="3" fill="#71717a" />
    <rect x="92" y="3" width="3" height="3" fill="#71717a" />
    <rect x="98" y="3" width="3" height="3" fill="#71717a" />
    <rect x="24" y="6" width="3" height="3" fill="#71717a" />
    <rect x="27" y="6" width="3" height="3" fill="#71717a" />
    <rect x="30" y="6" width="3" height="3" fill="#71717a" />
    <rect x="36" y="6" width="3" height="3" fill="#71717a" />
    <rect x="39" y="6" width="3" height="3" fill="#71717a" />
    <rect x="48" y="6" width="3" height="3" fill="#71717a" />
    <rect x="51" y="6" width="3" height="3" fill="#71717a" />
    <rect x="54" y="6" width="3" height="3" fill="#71717a" />
    <rect x="62" y="6" width="3" height="3" fill="#71717a" />
    <rect x="74" y="6" width="3" height="3" fill="#71717a" />
    <rect x="80" y="6" width="3" height="3" fill="#71717a" />
    <rect x="86" y="6" width="3" height="3" fill="#71717a" />
    <rect x="92" y="6" width="3" height="3" fill="#71717a" />
    <rect x="98" y="6" width="3" height="3" fill="#71717a" />
    <rect x="101" y="6" width="3" height="3" fill="#71717a" />
    <rect x="24" y="9" width="3" height="3" fill="#52525b" />
    <rect x="36" y="9" width="3" height="3" fill="#52525b" />
    <rect x="48" y="9" width="3" height="3" fill="#52525b" />
    <rect x="51" y="9" width="3" height="3" fill="#52525b" />
    <rect x="62" y="9" width="3" height="3" fill="#52525b" />
    <rect x="74" y="9" width="3" height="3" fill="#52525b" />
    <rect x="80" y="9" width="3" height="3" fill="#52525b" />
    <rect x="86" y="9" width="3" height="3" fill="#52525b" />
    <rect x="92" y="9" width="3" height="3" fill="#52525b" />
    <rect x="98" y="9" width="3" height="3" fill="#52525b" />
    <rect x="24" y="12" width="3" height="3" fill="#52525b" />
    <rect x="36" y="12" width="3" height="3" fill="#52525b" />
    <rect x="39" y="12" width="3" height="3" fill="#52525b" />
    <rect x="42" y="12" width="3" height="3" fill="#52525b" />
    <rect x="48" y="12" width="3" height="3" fill="#52525b" />
    <rect x="54" y="12" width="3" height="3" fill="#52525b" />
    <rect x="62" y="12" width="3" height="3" fill="#52525b" />
    <rect x="65" y="12" width="3" height="3" fill="#52525b" />
    <rect x="68" y="12" width="3" height="3" fill="#52525b" />
    <rect x="74" y="12" width="3" height="3" fill="#52525b" />
    <rect x="77" y="12" width="3" height="3" fill="#52525b" />
    <rect x="80" y="12" width="3" height="3" fill="#52525b" />
    <rect x="86" y="12" width="3" height="3" fill="#52525b" />
    <rect x="89" y="12" width="3" height="3" fill="#52525b" />
    <rect x="98" y="12" width="3" height="3" fill="#52525b" />
    <rect x="101" y="12" width="3" height="3" fill="#52525b" />
    <rect x="104" y="12" width="3" height="3" fill="#52525b" />
  </svg>
)

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)

  const handleBannerChange = useCallback((visible: boolean) => {
    setBannerVisible(visible)
  }, [])

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  const navItems: Array<{ label: string; href: string; external?: boolean; accent?: boolean }> = [
    { label: "GitHub", href: "https://github.com/yashdev9274/superCli", external: true },
    // { label: "Compare", href: "/compare" },
    { label: "Docs", href: DOCS_URL, external: true },
    { label: "Changelog", href: "/changelog" },
    // { label: "Waitlist", href: "/waitlist", accent: true },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-[100]">
      <BetaCountdownBanner onVisibilityChange={handleBannerChange} />
      <div className={`bg-background/95 backdrop-blur-sm transition-all duration-300 ${bannerVisible ? "border-t-0" : ""}`}>
        <div className="h-[70px] flex items-center justify-between px-5 md:px-12 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden relative w-8 h-8 flex items-center justify-center text-foreground/80 hover:text-foreground transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <div className="relative w-5 h-4">
              <span
                className={`absolute left-0 block w-5 h-[1.5px] bg-current rounded-full transition-all duration-300 ${
                  menuOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 block w-5 h-[1.5px] bg-current rounded-full transition-all duration-300 ${
                  menuOpen ? "opacity-0 translate-x-2" : "top-1/2 -translate-y-1/2 opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 block w-5 h-[1.5px] bg-current rounded-full transition-all duration-300 ${
                  menuOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-0"
                }`}
              />
            </div>
          </button>
          <Link href="/" className="flex items-center shrink-0">
            <PixelLogo />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-10">
          {navItems.map((item) =>
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                className="text-[15px] text-white hover:text-foreground transition-colors font-mono"
              >
                {item.label}
                {item.label === "GitHub" && <GithubStars />}
              </a>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className={`text-[15px] font-mono ${
                  item.accent ? "text-primary" : "text-white hover:text-foreground transition-colors"
                }`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <Link
          href="/login"
          className="px-5 py-2.5 bg-card border border-border text-foreground rounded-lg text-[14px] font-medium hover:bg-accent transition-colors font-mono"
        >
          Login
        </Link>
      </div>
      </div>

      <div
        className={`fixed inset-0 z-40 transition-all duration-500 ${
          bannerVisible ? "top-[114px] sm:top-[110px]" : "top-[70px]"
        } ${
          menuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-xl" />

        <nav className="relative z-10 flex flex-col items-center justify-center h-full px-6">
          <div className="w-full max-w-sm space-y-1">
            {navItems.map((item, i) => (
              <div
                key={item.label}
                className={`transition-all duration-500 delay-[${
                  i * 80
                }ms] ${
                  menuOpen
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{
                  transitionDelay: menuOpen ? `${i * 80}ms` : "0ms",
                }}
              >
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-5 py-4 rounded-xl text-[17px] font-mono text-foreground/80 hover:text-foreground hover:bg-accent/30 transition-all duration-200"
                  >
                    <span className="text-primary/60 font-mono text-sm w-5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {item.label}
                    <span className="ml-auto text-muted-foreground/40 text-sm">↗</span>
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-3 px-5 py-4 rounded-xl text-[17px] font-mono transition-all duration-200 ${
                      item.accent
                        ? "text-primary bg-primary/5 hover:bg-primary/10"
                        : "text-foreground/80 hover:text-foreground hover:bg-accent/30"
                    }`}
                  >
                    <span className="text-primary/60 font-mono text-sm w-5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
