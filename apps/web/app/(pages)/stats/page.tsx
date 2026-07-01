"use client"

import { useEffect, useRef } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"

function AnimatedNumber({ value, label, prefix }: { value: number; label: string; prefix?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, { stiffness: 50, damping: 15 })
  const rounded = useTransform(spring, (v) => Math.floor(v))

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          motionValue.set(value)
          observer.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value, motionValue])

  return (
    <div ref={ref} className="text-center">
      <div className="font-mono text-[64px] md:text-[96px] font-bold tracking-tighter leading-none text-primary">
        {prefix}
        <motion.span>{rounded}</motion.span>
      </div>
      <p className="font-mono text-xs md:text-sm text-muted-foreground/60 uppercase tracking-[0.15em] mt-4">
        {label}
      </p>
    </div>
  )
}

export default function StatsPage() {
  return (
    <main className="min-h-screen bg-background dark relative flex flex-col mt-35">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <div className="pt-[140px] pb-24 px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="text-center mb-6"
        >
          <span className="text-[11px] font-mono text-primary uppercase tracking-[0.15em] mb-5">
            $ supercode/stats
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1], delay: 0.05 }}
          className="text-[32px] md:text-[44px] font-semibold tracking-tight text-center mb-16"
        >
          Growth so far
        </motion.h1>

        <div className="max-w-[600px] mx-auto flex flex-col sm:flex-row items-center justify-center gap-16 sm:gap-24 mb-90">
          <AnimatedNumber value={6342} label="downloads" />
          <AnimatedNumber value={195} label="users in 2 weeks" />
        </div>
      </div>

      <Footer />
    </main>
  )
}
