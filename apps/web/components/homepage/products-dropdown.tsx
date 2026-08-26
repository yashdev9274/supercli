"use client"

import React, { useState, useRef, useCallback } from "react"
import Link from "next/link"

const EASE = "cubic-bezier(0.23,1,0.32,1)"

interface ProductItem {
  label: string
  description: string
  href: string
  external?: boolean
  icon: React.ReactNode
}

const products: ProductItem[] = [
  {
    label: "Supercode Agent",
    description: "AI pair programmer that ships code with you",
    href: "/download",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Supercode Review",
    description: "Automated code review on every pull request",
    href: "/code-review",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "Supercode Voice Agent",
    description: "Code by speaking — hands-free development",
    href: "/download",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <path d="M8 1V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4.5 6.5C4.5 6.5 5.5 5 8 5C10.5 5 11.5 6.5 11.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M3 8.5C3 11 5.25 13 8 13C10.75 13 13 11 13 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="5.5" y1="15" x2="10.5" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

const developerItems: ProductItem[] = [
  {
    label: "Cortex SDK",
    description: "Build custom AI tooling on top of Supercode",
    href: "https://github.com/yashdev9274/superCli",
    external: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <path d="M5 3L2 8L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 3L14 8L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="9" y1="2" x2="7" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

function ProductRow({ item, index, isVisible }: { item: ProductItem; index: number; isVisible: boolean }) {
  const content = (
    <div
      className={`group flex items-start gap-3 px-3 py-2.5 rounded-lg transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-white/5 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5"
      }`}
      style={{ transitionDelay: isVisible ? `${index * 40}ms` : "0ms" }}
    >
      <div className="mt-0.5 text-muted-foreground/60 group-hover:text-foreground/80 transition-colors duration-150">
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-mono text-foreground/90 group-hover:text-foreground transition-colors duration-150">
          {item.label}
        </div>
        <div className="text-[11px] font-mono text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors duration-150 mt-0.5 leading-relaxed">
          {item.description}
        </div>
      </div>
      <svg
        className="w-3 h-3 mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </div>
  )

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {content}
      </a>
    )
  }

  return (
    <Link href={item.href} className="block">
      {content}
    </Link>
  )
}

export default function ProductsDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isHoveringMenu = useRef(false)

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsOpen(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      if (!isHoveringMenu.current) {
        setIsOpen(false)
      }
    }, 100)
  }, [])

  const handleMenuMouseEnter = useCallback(() => {
    isHoveringMenu.current = true
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const handleMenuMouseLeave = useCallback(() => {
    isHoveringMenu.current = false
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 100)
  }, [])

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className="relative text-[15px] font-mono text-white after:absolute after:bottom-[-3px] after:left-0 after:h-px after:w-0 after:bg-foreground after:transition-[width] after:duration-200 hover:text-foreground hover:after:w-full transition-colors ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center gap-1"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        Products
        <svg
          className={`w-3 h-3 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            isOpen ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        className={`absolute left-1/2 -translate-x-1/2 top-full pt-3 ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        onMouseEnter={handleMenuMouseEnter}
        onMouseLeave={handleMenuMouseLeave}
      >
        <div
          className={`w-[320px] rounded-xl border border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] origin-top ${
            isOpen
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-[0.97] -translate-y-1"
          }`}
        >
          <div className="p-2">
            <div className="px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
                Products
              </span>
            </div>
            <div className="mt-0.5">
              {products.map((item, i) => (
                <ProductRow key={item.label} item={item} index={i} isVisible={isOpen} />
              ))}
            </div>

            <div className="my-1.5 mx-3 h-px bg-white/[0.06]" />

            <div className="px-3 py-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
                Developer
              </span>
            </div>
            <div className="mt-0.5">
              {developerItems.map((item, i) => (
                <ProductRow
                  key={item.label}
                  item={item}
                  index={products.length + i}
                  isVisible={isOpen}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
