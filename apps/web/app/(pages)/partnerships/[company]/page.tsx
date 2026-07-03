import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowUpRight, Quote } from "lucide-react"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import { partners } from "@/data/partnerships"

interface Props {
  params: Promise<{ company: string }>
}

export async function generateStaticParams() {
  return partners.map((p) => ({ company: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company } = await params
  const partner = partners.find((p) => p.slug === company)
  if (!partner) return {}

  return {
    title: `Supercode × ${partner.name} — Case Study`,
    description: partner.description,
    metadataBase: new URL("https://supercli.vercel.app"),
    openGraph: {
      title: `Supercode × ${partner.name} — Case Study`,
      description: partner.description,
      url: `https://supercli.vercel.app/partnerships/${partner.slug}`,
      siteName: "Supercode",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `Supercode × ${partner.name} — Case Study`,
      description: partner.description,
    },
  }
}

export default async function PartnershipDetailPage({ params }: Props) {
  const { company } = await params
  const partner = partners.find((p) => p.slug === company)
  if (!partner) notFound()

  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <article className="pt-[120px] pb-24 px-6 max-w-[720px] mx-auto">
        {/* Back link */}
        <Link
          href="/partnerships"
          className="inline-flex items-center gap-2 text-[14px] text-muted-foreground hover:text-foreground transition-colors mb-12 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>All partnerships</span>
        </Link>

        {/* Hero */}
        <div className="mb-16">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold font-mono text-[22px] mb-6">
            {partner.logoSrc ? (
              <img src={partner.logoSrc} alt={partner.name} className="w-8 h-8 brightness-0 invert" />
            ) : (
              partner.logo
            )}
          </div>

          <h1 className="text-[36px] md:text-[48px] font-semibold tracking-tight mb-3">
            {partner.name}
          </h1>
          <p className="text-[18px] text-muted-foreground leading-relaxed">
            {partner.tagline}
          </p>
        </div>

        {/* Stat highlight */}
        <div className="border border-border rounded-lg p-8 mb-16 bg-card/50">
          <div className="text-[48px] md:text-[64px] font-bold text-primary font-mono tracking-tight leading-none mb-2">
            {partner.stat.value}
          </div>
          <div className="text-[16px] text-muted-foreground">
            {partner.stat.label}
          </div>
        </div>

        {/* Quote */}
        {/* <div className="relative border-l-2 border-primary pl-6 mb-16">
          <Quote className="absolute -top-3 -left-3 w-8 h-8 text-primary/20" />
          <blockquote className="text-[18px] md:text-[20px] leading-relaxed text-foreground/90 mb-4 italic">
            &ldquo;{partner.quote.text}&rdquo;
          </blockquote>
          <div className="text-[14px]">
            <div className="font-semibold text-foreground">
              {partner.quote.author}
            </div>
            <div className="text-muted-foreground">{partner.quote.role}</div>
          </div>
        </div> */}

        {/* Challenge */}
        <section className="mb-14">
          <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-6">
            $ The Challenge
          </h2>
          <div className="space-y-4 text-[15px] leading-relaxed text-foreground/85">
            {partner.challenge.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Solution */}
        <section className="mb-14">
          <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-6">
            $ The Solution
          </h2>
          <div className="space-y-4 text-[15px] leading-relaxed text-foreground/85">
            {partner.solution.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Results */}
        <section className="mb-16">
          <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-6">
            $ The Results
          </h2>
          <div className="space-y-4">
            {partner.results.map((result, i) => (
              <div
                key={i}
                className="border border-border rounded-lg p-6 bg-card/30"
              >
                <div className="text-[22px] font-bold text-primary font-mono tracking-tight mb-1">
                  {result.metric}
                </div>
                <p className="text-[14px] text-foreground/85 leading-relaxed">
                  {result.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="border-t border-border pt-12 text-center">
          <p className="text-[15px] text-muted-foreground mb-6">
            Ready to ship faster?
          </p>
          <a
            href="https://github.com/yashdev9274/superCli"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity"
          >
            Get started with Supercode
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>
      </article>

      <Footer />
    </main>
  )
}
