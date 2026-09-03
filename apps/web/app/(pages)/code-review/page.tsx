"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import {
  Zap, Shield, GitPullRequest, Bot, Eye,
  MessageSquare, Layers, TrendingUp, Lock, ArrowRight, ChevronDown, Play, X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { AnimateIcon } from "@/components/ui/animate-icon"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"

const curve = [0.23, 1, 0.32, 1] as const

const reviews = [
  {
    file: "src/lib/auth.ts",
    severity: "critical",
    issue: "Potential token exposure in error logs",
    description:
      "Auth tokens are being logged in plaintext when API requests fail. This could expose credentials in production logs.",
    suggestion: "Sanitize sensitive fields before logging",
    line: 142,
    pr: "#847",
  },
  {
    file: "src/components/DataTable.tsx",
    severity: "warning",
    issue: "Race condition in pagination state",
    description:
      "Rapid page changes can cause stale state updates. Missing cancellation of in-flight requests when user navigates.",
    suggestion: "Add AbortController to cancel previous fetch on page change",
    line: 89,
    pr: "#851",
  },
  {
    file: "src/api/webhooks/route.ts",
    severity: "info",
    issue: "Missing idempotency check for webhook handler",
    description:
      "Duplicate webhook deliveries will create duplicate database records. No idempotency key validation found.",
    suggestion: "Add idempotency key header check before processing",
    line: 23,
    pr: "#853",
  },
]

const steps = [
  {
    number: "01",
    title: "Connect your repository",
    description:
      "Install the Supercode GitHub app. We index your codebase and understand its architecture, conventions, and patterns.",
    icon: GitPullRequest,
    duration: "2 min",
  },
  {
    number: "02",
    title: "AI reviews every PR",
    description:
      "When you open a pull request, Supercode automatically analyzes your changes. It catches bugs, security issues, and performance problems.",
    icon: Bot,
    duration: "< 10s",
  },
  {
    number: "03",
    title: "Learn and adapt",
    description:
      "Supercode learns from your feedback and codebase patterns. It gets better at finding bugs that matter to your team.",
    icon: TrendingUp,
    duration: "Continuous",
  },
]

const features = [
  {
    title: "Security analysis",
    description:
      "Detects hardcoded secrets, SQL injection, XSS vulnerabilities, and authentication flaws before they reach production.",
    icon: Lock,
  },
  {
    title: "Performance audits",
    description:
      "Catches N+1 queries, missing database indexes, unbounded data fetching, and memory leaks in your code changes.",
    icon: Zap,
  },
  {
    title: "Architecture review",
    description:
      "Validates patterns, naming conventions, and structural decisions against your codebase's established norms.",
    icon: Layers,
  },
  {
    title: "PR summarization",
    description:
      "Auto-generates PR descriptions and review summaries. Context-aware diffs that highlight what matters.",
    icon: MessageSquare,
  },
  {
    title: "Custom rules",
    description:
      "Define team-specific review rules. Enforce patterns, conventions, and best practices that matter to your project.",
    icon: Shield,
  },
  {
    title: "Line-level comments",
    description:
      "Reviews are posted directly on the relevant lines of code. No context switching — just actionable feedback.",
    icon: Eye,
  },
]

const stats = [
  { value: "10s", label: "Average review time" },
  { value: "94%", label: "Bug detection rate" },
  { value: "<2%", label: "False positive rate" },
  { value: "1M+", label: "PRs reviewed" },
]

const testimonials = [
  {
    quote:
      "Supercode caught a critical auth bypass in our first week. It's like having a senior engineer review every PR at 3am.",
    author: "Sarah Chen",
    role: "CTO, Tundra",
  },
  {
    quote:
      "We replaced 3 separate security tools with Supercode. Faster reviews, fewer false positives, better coverage.",
    author: "Michael Ross",
    role: "Engineering Lead, Arcturus",
  },
]

const faqs = [
  {
    question: "How is this different from GitHub Copilot code review?",
    answer:
      "Supercode indexes your entire codebase and learns your project's patterns, not just the diff. It catches issues that require understanding how your codebase works together.",
  },
  {
    question: "Will it slow down our CI/CD pipeline?",
    answer:
      "No. Reviews complete in under 10 seconds on average. Supercode runs asynchronously and posts results as a GitHub comment, so it never blocks your pipeline.",
  },
  {
    question: "Does it work with monorepos?",
    answer:
      "Yes. Supercode understands monorepo structures, shared packages, and cross-project dependencies. It reviews changes with full context of your project layout.",
  },
  {
    question: "Can I customize what it looks for?",
    answer:
      "Yes. Define custom review rules specific to your team. Enforce naming conventions, architectural patterns, security requirements, or any other standard.",
  },
  {
    question: "Is my codebase used for training?",
    answer:
      "No. Your code is used only to provide context for reviews. It is never used to train or fine-tune any models. We support air-gapped deployments for enterprise.",
  },
]

const severityConfig: Record<string, { label: string; color: string }> = {
  critical: {
    label: "Critical",
    color: "text-red-600 dark:text-red-400",
  },
  warning: {
    label: "Warning",
    color: "text-amber-600 dark:text-amber-400",
  },
  info: {
    label: "Suggestion",
    color: "text-blue-600 dark:text-blue-400",
  },
}

const DEMO_YOUTUBE_ID = "MYLX-yUBlxA"

export default function CodeReviewPage() {
  const prefersReduced = useReducedMotion()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  const heroInitial = prefersReduced ? false : { opacity: 0, transform: "translateY(16px)" }
  const heroAnimate = { opacity: 1, transform: "translateY(0px)" }
  const heroTransition = { duration: 0.6, ease: curve }

  const cardInitial = prefersReduced ? false : { opacity: 0, transform: "translateY(12px)" }
  const cardAnimate = { opacity: 1, transform: "translateY(0px)" }

  return (
    <main className="min-h-screen bg-white dark:bg-[oklch(0.1_0_0)] text-neutral-900 dark:text-white scroll-smooth">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-neutral-100 dark:border-neutral-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.97_0_0/1),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.2_0.006_0/1),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-24 lg:pt-40 lg:pb-32">
          <motion.div
            initial={heroInitial}
            animate={heroAnimate}
            transition={heroTransition}
            className="mx-auto max-w-3xl text-center"
          >
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 py-1.5 text-xs text-neutral-600 dark:text-neutral-400">
              <Bot className="h-3.5 w-3.5" />
              Powered by deep codebase understanding
            </div>

            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">
              AI code review
              <br className="hidden sm:block" />
              <span className="text-neutral-400 dark:text-neutral-500">
                that catches bugs
              </span>
            </h1>

            <p className="mt-6 text-lg text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Supercode reviews every pull request in seconds. It understands
              your entire codebase — not just the diff — to catch bugs, security
              issues, and performance problems before they ship.
            </p>

            <div className="mt-10 flex items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 active:scale-[0.97] transition-transform duration-150"
              >
                <Link href="https://cal.com/yash-dewasthale/talk-to-founder">
                  Try Code Review
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="active:scale-[0.97] transition-transform duration-150"
              >
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
          </motion.div>

          {/* Demo Video */}
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, transform: "translateY(16px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ duration: 0.6, ease: curve, delay: 0.2 }}
            className="mt-20 mx-auto max-w-4xl"
          >
            <button
              type="button"
              onClick={() => setIsDemoOpen(true)}
              className="group relative w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-950 shadow-2xl shadow-neutral-200/50 dark:shadow-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950"
              aria-label="Play Supercode Review demo video"
            >
              <div className="relative aspect-video w-full">
                <Image
                  src={`https://img.youtube.com/vi/${DEMO_YOUTUBE_ID}/maxresdefault.jpg`}
                  alt="Supercode Review product demo"
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 896px) 100vw, 896px"
                  priority
                />
                <div className="absolute inset-0 bg-black/25 transition-colors duration-300 group-hover:bg-black/35" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-lg transition-transform duration-300 group-hover:scale-105 dark:bg-white">
                    <Play className="h-7 w-7 fill-current ml-0.5" />
                  </div>
                </div>
              </div>
            </button>
          </motion.div>
        </div>
      </section>

      {isDemoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Supercode Review demo video"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            aria-label="Close video"
            onClick={() => setIsDemoOpen(false)}
          />
          <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
            <button
              type="button"
              onClick={() => setIsDemoOpen(false)}
              className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              aria-label="Close video"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${DEMO_YOUTUBE_ID}?autoplay=1&rel=0`}
                title="Supercode Review demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Product Showcase */}
      <section className="border-b border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
          <motion.div
            initial={heroInitial}
            whileInView={heroAnimate}
            viewport={{ once: true, margin: "-100px" }}
            transition={heroTransition}
            className="max-w-2xl mb-12"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-400 mb-6">
              Insights
            </div>
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Open Sourced AI code reviews.
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 leading-relaxed">
              We pioneered AI code reviews and have best-in-class context. Our
              automated reviews are the central validation layer for AI code.
            </p>
          </motion.div>

          <motion.div
            initial={prefersReduced ? false : { opacity: 0, transform: "translateY(16px)" }}
            whileInView={{ opacity: 1, transform: "translateY(0px)" }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: curve }}
            className="grid gap-8 lg:grid-cols-[1fr_340px] items-start"
          >
            {/* Left: Review Mockup */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl shadow-neutral-200/50 dark:shadow-none overflow-hidden">
              {/* PR Header */}
              <div className="flex items-center gap-3 border-b border-neutral-100 dark:border-neutral-800 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 ml-2">
                  <GitPullRequest className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="font-mono text-neutral-900 dark:text-white">
                    #847
                  </span>
                  <span>Fix auth token handling</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                    3 findings
                  </span>
                </div>
              </div>

              {/* Review Items */}
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {reviews.map((review) => {
                  const sev = severityConfig[review.severity]
                  return (
                    <div key={review.line} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-medium ${sev.color}`}
                            >
                              {sev.label}
                            </span>
                            <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
                              {review.file}:{review.line}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">
                            {review.issue}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                            {review.description}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 text-xs text-neutral-600 dark:text-neutral-400">
                              {review.suggestion}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Reviewed by</span>
                  <Image
                    src="/supercode-logo.png"
                    alt="Supercode"
                    width={20}
                    height={20}
                    className="h-5 w-auto"
                  />
                </div>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  8.2s
                </span>
              </div>
            </div>

            {/* Right: Features List */}
            <div className="space-y-5">
              <div>
                <div className="font-medium text-neutral-900 dark:text-white">Code Analysis</div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Understands your entire codebase, patterns, and conventions.
                </div>
              </div>
              <div>
                <div className="font-medium text-neutral-900 dark:text-white">Inline Comments</div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Actionable suggestions directly on the lines that matter.
                </div>
              </div>
              <div>
                <div className="font-medium text-neutral-900 dark:text-white">Security Detection</div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Catches vulnerabilities before they reach production.
                </div>
              </div>
              <div>
                <div className="font-medium text-neutral-900 dark:text-white">Learning System</div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  Gets smarter with every review, adapting to your team's style.
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={cardInitial}
                whileInView={cardAnimate}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: curve, delay: i * 0.07 }}
                className="text-center"
              >
                <div className="text-3xl font-medium tracking-tight text-neutral-900 dark:text-white">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-b border-neutral-100 dark:border-neutral-900"
      >
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <motion.div
            initial={heroInitial}
            whileInView={heroAnimate}
            viewport={{ once: true, margin: "-100px" }}
            transition={heroTransition}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-400 mb-6">
              How it works
            </div>
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Three steps to better code reviews
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Get started in minutes. No configuration needed — Supercode adapts
              to your codebase automatically.
            </p>
          </motion.div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={cardInitial}
                whileInView={cardAnimate}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: curve, delay: i * 0.07 }}
                className="relative"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    <AnimateIcon animateOnHover animation="scale">
                      <step.icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                    </AnimateIcon>
                  </div>
                  <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500 font-mono">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {step.description}
                </p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
                  <span className="font-mono">{step.duration}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <motion.div
            initial={heroInitial}
            whileInView={heroAnimate}
            viewport={{ once: true, margin: "-100px" }}
            transition={heroTransition}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-400 mb-6">
              Capabilities
            </div>
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Everything your code review needs
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 leading-relaxed">
              From security vulnerabilities to architectural anti-patterns,
              Supercode covers every dimension of code quality.
            </p>
          </motion.div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={cardInitial}
                whileInView={cardAnimate}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: curve, delay: i * 0.07 }}
                className="group rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors duration-150"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700 transition-colors duration-150">
                  <AnimateIcon animateOnHover animation="scale">
                    <feature.icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                  </AnimateIcon>
                </div>
                <h3 className="mt-4 text-base font-medium text-neutral-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {/* <section className="border-b border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <motion.div
            initial={heroInitial}
            whileInView={heroAnimate}
            viewport={{ once: true, margin: "-100px" }}
            transition={heroTransition}
            className="max-w-2xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-400 mb-6">
              Trusted by engineering teams
            </div>
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Teams ship better code with Supercode
            </h2>
          </motion.div>

          <div className="mt-16 grid gap-8 md:grid-cols-2">
            {testimonials.map((testimonial, i) => (
              <motion.div
                key={testimonial.author}
                initial={cardInitial}
                whileInView={cardAnimate}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: curve, delay: i * 0.07 }}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-8"
              >
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
                  "{testimonial.quote}"
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  <div>
                    <div className="text-sm font-medium text-neutral-900 dark:text-white">
                      {testimonial.author}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section> */}

      {/* FAQ */}
      <section className="border-b border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-24 lg:py-32">
          <motion.div
            initial={heroInitial}
            whileInView={heroAnimate}
            viewport={{ once: true, margin: "-100px" }}
            transition={heroTransition}
          >
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Frequently asked questions
            </h2>
          </motion.div>

          <div className="mt-12 space-y-0">
            {faqs.map((faq, i) => (
              <motion.div
                key={faq.question}
                initial={cardInitial}
                whileInView={cardAnimate}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: curve, delay: i * 0.06 }}
                className="border-b border-neutral-200 dark:border-neutral-800"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between py-6 text-left"
                >
                  <h3 className="text-base font-medium text-neutral-900 dark:text-white pr-4">
                    {faq.question}
                  </h3>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    openFaq === i ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <motion.div
            initial={heroInitial}
            whileInView={heroAnimate}
            viewport={{ once: true, margin: "-100px" }}
            transition={heroTransition}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Start reviewing code smarter
            </h2>
            <p className="mt-4 text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Install the GitHub app and get your first AI-powered code review
              in under 2 minutes.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 active:scale-[0.97] transition-transform duration-150"
              >
                <Link href="https://github.com/apps/supercode">
                  Install on GitHub
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
