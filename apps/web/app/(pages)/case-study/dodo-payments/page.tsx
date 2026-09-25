import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "How Supercode Migrated 100% of Customers to Dodo Payments in 72 Hours — With Zero Downtime",
  description:
    "A complete payment migration for 100+ paying customers — zero downtime, zero lost revenue. Learn how Supercode switched from Polar to Dodo Payments.",
  openGraph: {
    title: "How Supercode Migrated 100% of Customers to Dodo Payments in 72 Hours",
    description:
      "A complete payment migration for 100+ paying customers — zero downtime, zero lost revenue.",
    images: [
      {
        url: "/supercode-ddp2.png",
        width: 1200,
        height: 630,
        alt: "Supercode x Dodo Payments case study",
      },
    ],
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/supercode-ddp2.png"],
  },
}

const metrics = [
  { value: "100%", label: "Customers migrated", color: "text-emerald-500" },
  { value: "0", label: "Downtime", color: "text-blue-500" },
  { value: "0", label: "Lost revenue", color: "text-purple-500" },
  { value: "72h", label: "Total migration time", color: "text-amber-500" },
]

const moreCaseStudies = [
  { company: "Mole", icon: "M", color: "bg-orange-100 dark:bg-orange-900/30" },
  { company: "Wisp CMS", icon: "W", color: "bg-blue-100 dark:bg-blue-900/30" },
  { company: "Supercode", icon: "S", color: "bg-emerald-100 dark:bg-emerald-900/30" },
]

export default function DodoPaymentsCaseStudy() {
  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <article className="pt-[120px] pb-24 px-6">
        <div className="max-w-[1100px] mx-auto">
          <Link
            href="/case-study"
            className="inline-flex items-center gap-2 text-[13px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            ← All case studies
          </Link>

          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
            <div className="flex-1 min-w-0">
              <div className="mb-10">
                <h1 className="text-[32px] md:text-[44px] font-semibold tracking-tight leading-[1.15] mb-4">
                  How Supercode Migrated 100% of Customers to Dodo Payments in 72 Hours — With Zero Downtime
                </h1>

                <p className="text-[17px] text-muted-foreground leading-relaxed max-w-[600px] mb-8">
                  A complete payment migration for 100+ paying customers — zero
                  downtime, zero lost revenue. Here&apos;s how we did it and why Dodo
                  Payments was the right choice.
                </p>

                <div className="rounded-2xl overflow-hidden border border-border max-w-[640px]">
                  <img
                    src="/supercode-ddp2.png"
                    alt="Supercode x Dodo Payments case study banner"
                    className="w-full h-auto"
                  />
                </div>
              </div>

              <div className="space-y-10 text-[16px] leading-[1.8]">
                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    The Company
                  </h2>
                  <p className="text-foreground/80">
                    Supercode is the open-source SWE agent that works directly in
                    your codebase. We build, debug, and ship from your terminal, IDE,
                    Slack, or the web. Our users describe what they need, and Supercode
                    handles the rest.
                  </p>
                  <p className="text-foreground/80 mt-3">
                    As our user base grew, so did the complexity of our payment
                    infrastructure. What started as a simple billing setup became a
                    bottleneck that was slowing us down.
                  </p>
                </section>

                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    Why We Migrated
                  </h2>
                  <p className="text-foreground/80 mb-4">
                    We originally chose Polar as our payment provider. It worked for
                    our early days, but as we scaled, several pain points emerged:
                  </p>
                  <ul className="space-y-3 text-foreground/80">
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Limited payment methods:</strong> Our users are global.
                        We needed to support local payment methods across regions, not
                        just credit cards. Polar&apos;s coverage was too narrow.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Tax compliance complexity:</strong> Managing VAT, GST,
                        and sales tax across multiple jurisdictions was eating into our
                        engineering time. We needed a Merchant of Record that handled
                        this automatically.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Licensing infrastructure:</strong> We needed a robust
                        license key system that could handle subscription validation,
                        device limits, and real-time activation without building it
                        from scratch.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Developer experience:</strong> The integration
                        overhead was too high. Every billing change required
                        significant backend work, slowing our product velocity.
                      </span>
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    The Challenges
                  </h2>
                  <p className="text-foreground/80 mb-4">
                    Migrating payment providers while maintaining live customers is
                    one of the riskiest operations a SaaS company can undertake. We
                    faced several specific challenges:
                  </p>
                  <ul className="space-y-3 text-foreground/80">
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>No downtime tolerance:</strong> Our customers are
                        developers who depend on Supercode daily. Any payment
                        interruption would mean lost trust and lost revenue.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Existing subscription continuity:</strong> Customers
                        with active subscriptions needed to continue uninterrupted.
                        Recurring billing, renewal dates, and payment history had to
                        transfer cleanly.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>License key migration:</strong> We had an existing
                        license system tied to Polar. Migrating licenses while
                        maintaining validation for existing users required careful
                        coordination.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Webhook and integration updates:</strong> Our billing
                        webhooks, email notifications, and internal dashboards all
                        needed to be rewired without breaking.
                      </span>
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    Why Dodo Payments
                  </h2>
                  <p className="text-foreground/80 mb-4">
                    After evaluating several payment providers, Dodo Payments stood
                    out for specific reasons that directly addressed our challenges:
                  </p>
                  <ul className="space-y-3 text-foreground/80">
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Merchant of Record model:</strong> Dodo handles tax
                        collection, compliance, and remittance across 220+ countries.
                        This eliminated our tax compliance headache entirely.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Global payment methods:</strong> 40+ local payment
                        methods including Apple Pay, Google Pay, and regional options.
                        Our customers can pay however they prefer.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Built-in license key management:</strong> Dodo&apos;s
                        native license key infrastructure meant we didn&apos;t need to
                        build or maintain a separate licensing system.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Developer-first documentation:</strong> The
                        documentation was clean, comprehensive, and AI-friendly. Our
                        team could work with it efficiently using tools like Claude.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Fast onboarding:</strong> Account approval happened
                        within hours. Integration was measured in days, not weeks.
                      </span>
                    </li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    The Implementation
                  </h2>
                  <p className="text-foreground/80 mb-4">
                    We approached the migration in three phases to minimize risk:
                  </p>

                  <div className="space-y-4 mt-6">
                    <div className="p-5 rounded-xl border border-border bg-card">
                      <h3 className="text-[17px] font-semibold mb-2">
                        Phase 1: Parallel Setup (Days 1-2)
                      </h3>
                      <p className="text-foreground/80 text-[15px]">
                        We set up Dodo Payments alongside Polar. Both systems ran
                        simultaneously, allowing us to test the new integration without
                        affecting existing customers. We created test products,
                        validated checkout flows, and confirmed webhook delivery.
                      </p>
                    </div>

                    <div className="p-5 rounded-xl border border-border bg-card">
                      <h3 className="text-[17px] font-semibold mb-2">
                        Phase 2: New Customer Migration (Days 3-4)
                      </h3>
                      <p className="text-foreground/80 text-[15px]">
                        All new signups were routed through Dodo Payments. Existing
                        customers on Polar continued uninterrupted. This let us
                        validate the production flow with real transactions before
                        touching existing subscriptions.
                      </p>
                    </div>

                    <div className="p-5 rounded-xl border border-border bg-card">
                      <h3 className="text-[17px] font-semibold mb-2">
                        Phase 3: Existing Customer Migration (Days 5-7)
                      </h3>
                      <p className="text-foreground/80 text-[15px]">
                        We migrated existing subscribers in batches. Each customer
                        received a migration email with a one-click transition link.
                        License keys were regenerated through Dodo&apos;s system and
                        customers were notified. The entire process was completed
                        without any service interruption.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    The Result
                  </h2>
                  <p className="text-foreground/80 mb-6">
                    The migration was completed in 72 hours with zero downtime and
                    zero lost revenue. Here&apos;s what changed:
                  </p>

                  <div className="space-y-4">
                    <div className="flex gap-3 text-foreground/80">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>100% customer migration:</strong> Every paying
                        customer was successfully transitioned. No one was left behind
                        or experienced a billing interruption.
                      </span>
                    </div>
                    <div className="flex gap-3 text-foreground/80">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Zero downtime:</strong> The entire migration happened
                        transparently. Customers noticed nothing except a better
                        payment experience.
                      </span>
                    </div>
                    <div className="flex gap-3 text-foreground/80">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Improved payment coverage:</strong> Customers can now
                        pay with 40+ methods. Our international conversion rate
                        increased immediately.
                      </span>
                    </div>
                    <div className="flex gap-3 text-foreground/80">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Tax compliance offloaded:</strong> VAT, GST, and sales
                        tax are now handled entirely by Dodo. Our engineering team
                        reclaimed hours previously spent on compliance work.
                      </span>
                    </div>
                    <div className="flex gap-3 text-foreground/80">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Faster product velocity:</strong> With billing
                        infrastructure handled by Dodo, we ship product improvements
                        faster. Payment-related feature requests dropped to near zero.
                      </span>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                    What We&apos;d Tell Others
                  </h2>
                  <p className="text-foreground/80 mb-4">
                    If you&apos;re considering a payment migration, here&apos;s what we learned:
                  </p>
                  <ul className="space-y-3 text-foreground/80">
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Run parallel systems first.</strong> Don&apos;t cut over
                        blindly. Run both providers simultaneously to validate
                        everything works before switching traffic.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Migrate new customers first.</strong> Use new signups
                        as your canary. If the new provider works for fresh
                        transactions, it&apos;ll work for migrations.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Communicate early and often.</strong> Tell your
                        customers what&apos;s happening. A simple &quot;we&apos;re upgrading our
                        payments&quot; email builds trust, not fear.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary mt-1 shrink-0">—</span>
                      <span>
                        <strong>Choose a provider that supports your growth.</strong>
                        Dodo&apos;s Merchant of Record model means we never have to think
                        about tax compliance again. That&apos;s worth more than any feature
                        comparison.
                      </span>
                    </li>
                  </ul>
                </section>

                <section className="pt-4 border-t border-border">
                  <blockquote className="text-foreground/80 italic text-[17px] leading-relaxed">
                    &quot;The migration was one of the smoothest infrastructure changes
                    we&apos;ve ever made. Dodo Payments didn&apos;t just replace Polar — it
                    gave us the foundation to scale without worrying about payments,
                    taxes, or compliance. We can focus entirely on building Supercode.&quot;
                  </blockquote>
                  <p className="text-[14px] text-muted-foreground mt-3">
                    — Yash Dewasthale, Founder, Supercode
                  </p>
                </section>
              </div>
            </div>

            <aside className="lg:w-[300px] shrink-0">
              <div className="lg:sticky lg:top-[140px] space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="p-4 rounded-xl border border-border bg-card"
                    >
                      <div
                        className={`text-[28px] font-semibold tracking-tight ${metric.color}`}
                      >
                        {metric.value}
                      </div>
                      <div className="text-[12px] text-muted-foreground mt-1">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-5 rounded-xl border border-border bg-card">
                  <h3 className="text-[15px] font-semibold mb-2">
                    Try Dodo Payments
                  </h3>
                  <p className="text-[13px] text-muted-foreground mb-4">
                    Start accepting payments in minutes with zero upfront costs.
                  </p>
                  <a
                    href="https://dodopayments.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center h-10 px-5 rounded-lg text-[14px] font-medium font-mono bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150 ease-out"
                  >
                    Get Started
                  </a>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <span className="text-[13px] text-muted-foreground">Share</span>
                  <button className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center transition-[background-color,transform] duration-150 ease-out [@media(hover:hover)]:hover:bg-accent/30 active:scale-[0.92]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </button>
                  <button className="w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center transition-[background-color,transform] duration-150 ease-out [@media(hover:hover)]:hover:bg-accent/30 active:scale-[0.92]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </button>
                </div>
              </div>
            </aside>
          </div>

          {/* <section className="mt-20 pt-12 border-t border-border">
            <h2 className="text-[24px] font-semibold tracking-tight mb-8">
              More Case Studies
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {moreCaseStudies.map((study) => (
                <div
                  key={study.company}
                  className="group p-6 rounded-2xl border border-border bg-card [@media(hover:hover)]:hover:bg-accent/30 active:scale-[0.98] transition-[background-color,border-color,transform] duration-150 ease-out cursor-pointer"
                >
                  <div
                    className={`w-14 h-14 rounded-xl ${study.color} flex items-center justify-center mb-4`}
                  >
                    <span className="text-xl font-bold text-foreground/60">
                      {study.icon}
                    </span>
                  </div>
                  <h3 className="text-[16px] font-semibold tracking-tight group-hover:text-primary transition-colors duration-200">
                    {study.company}
                  </h3>
                </div>
              ))}
            </div>
          </section> */}
        </div>
      </article>

      <Footer />
    </main>
  )
}
