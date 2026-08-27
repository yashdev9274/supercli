"use client"

import React from "react"

const VERCEL_OSS_URL = "https://vercel.com/oss"

const VercelMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 115 100"
    aria-hidden="true"
    className={className}
  >
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m57.5 0 57.5 100H0z"
      clipRule="evenodd"
    />
  </svg>
)

const SponsorsSection = () => {
  return (
    <section className="py-20 md:py-24 px-6 border-t border-border">
      <div className="max-w-[1100px] mx-auto text-center">
        <div className="mb-10 md:mb-12">
          <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-4">
            $ Our Sponsors
          </h2>
          <h3 className="text-[28px] md:text-[36px] text-[#A1A1AA] font-semibold tracking-tight max-w-[520px] mx-auto leading-[1.15]">
            Backed by the builders of the web
          </h3>
        </div>

        <div className="flex justify-center">
          <a
            href={VERCEL_OSS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Vercel Open Source Program"
            className="group inline-flex items-center gap-3 px-2 py-1 transition-opacity duration-200 hover:opacity-80"
          >
            <VercelMark className="h-5 w-6 text-foreground" />
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="text-[15px] font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                Vercel
              </span>
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                Open Source
              </span>
            </span>
          </a>
        </div>
      </div>
    </section>
  )
}

export default SponsorsSection
