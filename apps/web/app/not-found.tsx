"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"

const EASE = [0.23, 1, 0.32, 1] as const

export default function NotFound() {
  const pathname = usePathname()
  const [showCursor, setShowCursor] = useState(true)
  const [showHome, setShowHome] = useState(false)

  useEffect(() => {
    const cursor = setInterval(() => setShowCursor((c) => !c), 530)
    const home = setTimeout(() => setShowHome(true), 800)
    return () => {
      clearInterval(cursor)
      clearTimeout(home)
    }
  }, [])

  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <div className="pt-[140px] pb-24 px-6 max-w-[720px] mx-auto min-h-screen flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="font-mono text-[13px] text-primary uppercase tracking-[0.15em] mb-8">
            $ Error 404
          </div>

          <div className="space-y-4 mb-12">
            <p className="text-[14px] font-mono text-muted-foreground/60">
              <span className="text-muted-foreground/40">$ </span>
              <span>find --path=&quot;{pathname}&quot;</span>
            </p>
            <p className="text-[14px] font-mono text-red-400/70">
              <span className="text-muted-foreground/40">$ </span>
              <span>
                error: no resource at &quot;
                <span className="text-foreground/60">{pathname}</span>
                &quot;
              </span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-mono text-muted-foreground/40">$</span>
              <span className="text-[14px] font-mono text-muted-foreground/40">cd</span>
              <span
                className={`inline-block w-2 h-[15px] bg-primary transition-opacity duration-100 ${showCursor ? "opacity-100" : "opacity-0"}`}
              />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showHome ? 1 : 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <Link
              href="/"
              className="group inline-flex items-center gap-3 px-5 py-3 rounded-lg border border-border bg-card/30 hover:bg-card/60 hover:border-primary/40 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            >
              <span className="text-[13px] font-mono text-primary group-hover:translate-x-0.5 transition-transform duration-200">
                →
              </span>
              <span className="text-[14px] font-mono text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                Return to home
              </span>
            </Link>
          </motion.div>
        </motion.div>
      </div>

      <Footer />
    </main>
  )
}
