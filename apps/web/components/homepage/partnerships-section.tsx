"use client"

import React from "react"
import Link from "next/link"
import { partners } from "@/data/partnerships"
import { ArrowUpRight } from "lucide-react"

const PartnershipsSection = () => {
  const featured = partners.slice(0, 3)

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-4">
              $ Partnerships
            </h2>
            <h3 className="text-[28px] md:text-[36px] font-semibold tracking-tight max-w-[500px] leading-[1.15]">
              Real teams shipping with Supercode
            </h3>
          </div>
          <Link
            href="/partnerships"
            className="hidden md:inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>View all</span>
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {featured.map((partner) => (
            <Link
              key={partner.slug}
              href={`/partnerships/${partner.slug}`}
              className="group border border-border rounded-lg p-6 hover:border-primary/40 transition-colors duration-200 bg-card/30 hover:bg-card/60"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold font-mono text-[16px] mb-4">
                {partner.logoSrc ? (
                  <img src={partner.logoSrc} alt={partner.name} className="w-6 h-6 brightness-0 invert" />
                ) : (
                  partner.logo
                )}
              </div>

              <h4 className="text-[17px] font-semibold tracking-tight mb-2 group-hover:text-primary transition-colors">
                {partner.name}
              </h4>
              <p className="text-[13px] text-muted-foreground leading-relaxed mb-5 line-clamp-2">
                {partner.description}
              </p>

              <div className="border-t border-border pt-4">
                <div className="text-[22px] font-bold text-primary font-mono tracking-tight">
                  {partner.stat.value}
                </div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {partner.stat.label}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/partnerships"
            className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>View all partnerships</span>
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default PartnershipsSection
