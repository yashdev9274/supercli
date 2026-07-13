"use client"

import { useState } from "react"

export default function ContactClient() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const email = (form.elements.namedItem("email") as HTMLInputElement).value
    const message = (form.elements.namedItem("message") as HTMLTextAreaElement).value

    window.open(
      `mailto:yashdev.yvd@gmail.com?subject=Contact%20Inquiry&body=${encodeURIComponent(`From: ${email}\n\n${message}`)}`,
      "_blank"
    )
    setSubmitted(true)
  }

  return (
    <>
      <h1 className="text-[36px] md:text-[48px] font-semibold tracking-tight mb-2">
        Get in touch
      </h1>
      <p className="text-muted-foreground text-[16px] mb-12 max-w-[600px]">
        We&apos;d love to hear from you. Fill out the form below or reach out
        directly via email.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Book a call */}
        <div className="space-y-5">
          <div>
            <p className="text-sm text-foreground/60 mb-1.5 font-mono">
              Talk to the founder
            </p>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
              Got a question, feature request, or just want to say hi? I&apos;d
              love to hear how you&apos;re using Supercode and what we should
              build next. Open to everyone — no sales, just direct chat with the
              founder.
            </p>
            <a
              href="https://cal.com/yash-dewasthale/talk-to-founder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium font-mono bg-white/10 text-foreground hover:bg-white/15 border border-white/10 transition-all duration-200 active:scale-[0.97]"
            >
              Book a call
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3.5 h-3.5"
              >
                <path d="M7 7h10v10" />
                <path d="M17 7 7 17" />
              </svg>
            </a>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-sm text-foreground/60 mb-1.5 font-mono">
              Or email us
            </p>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
              Prefer writing? Send us a message and we&apos;ll get back to you.
            </p>
          </div>
        </div>

        {/* Contact Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm text-foreground/60 mb-1.5 font-mono"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label
              htmlFor="message"
              className="block text-sm text-foreground/60 mb-1.5 font-mono"
            >
              How can we help?
            </label>
            <textarea
              id="message"
              name="message"
              rows={5}
              required
              placeholder="Tell us how we can help..."
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors resize-none"
            />
          </div>
          <button
            type="submit"
            className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {submitted ? "Sent" : "Submit"}
          </button>
        </form>

        {/* Email Contacts */}
        {/* <div className="space-y-8">
          <div>
            <p className="text-sm text-foreground/60 mb-1 font-mono">
              Get help
            </p>
            <a
              href="mailto:yashdev.yvd@gmail.com"
              className="text-sm text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              yashdev.yvd@gmail.com
            </a>
          </div>
          <div>
            <p className="text-sm text-foreground/60 mb-1 font-mono">
              Work at Supercode
            </p>
            <a
              href="mailto:yashdev.yvd@gmail.com"
              className="text-sm text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              yashdev.yvd@gmail.com
            </a>
          </div>
          <div>
            <p className="text-sm text-foreground/60 mb-1 font-mono">
              Report security concerns</p>
            <a
              href="mailto:yashdev.yvd@gmail.com"
              className="text-sm text-foreground underline underline-offset-4 hover:text-primary transition-colors"
            >
              yashdev.yvd@gmail.com
            </a>
          </div>
        </div> */}
      </div>
    </>
  )
}
