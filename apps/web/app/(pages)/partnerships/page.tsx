import type { Metadata } from "next"
import Link from "next/link"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import { partners } from "@/data/partnerships"
import { ArrowUpRight } from "lucide-react"

export const metadata: Metadata = {
  title: "Supercode — Partnerships & Case Studies",
  description:
    "Learn how teams use Supercode to ship faster, improve code quality, and automate their workflows.",
  metadataBase: new URL("https://supercli.vercel.app"),
  openGraph: {
    title: "Supercode — Partnerships & Case Studies",
    description:
      "Learn how teams use Supercode to ship faster, improve code quality, and automate their workflows.",
    url: "https://supercli.vercel.app/partnerships",
    siteName: "Supercode",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Supercode — Partnerships & Case Studies",
    description:
      "Learn how teams use Supercode to ship faster, improve code quality, and automate their workflows.",
  },
}

export default function PartnershipsPage() {
  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <div className="pt-[120px] pb-24 px-6 max-w-[1100px] mx-auto">
        <h1 className="text-[36px] md:text-[48px] text-[#A1A1AA] font-semibold tracking-tight mb-2">
          Partnerships
        </h1>
        <p className="text-muted-foreground text-[16px] mb-16 max-w-[600px]">
          Real teams, real results. See how engineering organizations use
          Supercode to ship faster and build better software.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {partners.map((partner) => (
            <Link
              key={partner.slug}
              href={`/partnerships/${partner.slug}`}
              className="group relative border border-border rounded-lg p-8 hover:border-primary/40 transition-colors duration-200 bg-card/50 hover:bg-card/80"
            >
              <div className="flex items-start justify-between mb-6">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-primary font-bold font-mono text-[18px] ${partner.slug === "mergedev" || partner.slug === "concentrateai" || partner.slug === "dodopayments" || partner.slug === "orcarouter" ? "bg-black/40" : "bg-primary/10"}`}>
                  {partner.logoSrc ? (
                    <img src={partner.logoSrc} alt={partner.name} className={`w-7 h-7 ${partner.slug !== "mergedev" && partner.slug !== "dodopayments" && partner.slug !== "orcarouter" ? "brightness-0 invert" : ""}`} />
                  ) : (
                    partner.logo
                  )}
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
              </div>

              <h2 className="text-[22px] font-semibold text-[#A1A1AA] tracking-tight mb-2 group-hover:text-primary transition-colors">
                {partner.name}
              </h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
                {partner.description}
              </p>

              <div className="border-t border-border pt-5">
                <div className="text-[28px] font-bold text-primary font-mono tracking-tight">
                  {partner.stat.value}
                </div>
                <div className="text-[13px] text-muted-foreground mt-1">
                  {partner.stat.label}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  )
}
