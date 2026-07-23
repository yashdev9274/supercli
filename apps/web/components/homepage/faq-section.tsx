"use client"

import React from "react"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"

const FAQ = [
  {
    q: "What is Supercode?",
    a: "Supercode is an open source universal engineering harness agent that helps you write and run code with any AI model. It's available as a terminal-based CLI, desktop app, or IDE extension.",
  },
  {
    q: "How do I use Supercode?",
    a: "The easiest way to get started is to run npm install -g supercode-cli@latest and read the docs.",
  },
  {
    q: "What models are available on each plan?",
    a: "Spark grants access to open-weight models (DeepSeek,Minimax, Moonshot, Mistral, etc.) at a lower ctx window and low query limits. Pro adds premium models (Claude Opus, GPT-4o, Gemini Ultra) with expanded context. Ultra unlocks the full model catalog at maximum context.",
  },
  {
    q: "What does the Spark $1 deposit cover?",
    a: "Spark cost $1/month for all new users — fully refundable(terms & conditions applied). It is free for existing users. You can request a refund at any time.",
  },
  {
    q: "How does regional pricing work for Pro?",
    a: "We offer location-based pricing for the Pro plan. Indian users pay $9/month (or $100/year). International users pay $12/month (or $140/year). All other plans are priced uniformly worldwide.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. Your plan changes take effect immediately. Upgrades are prorated; downgrades credit your account for the remaining billing period.",
  },
  
  {
    q: "How does the Merge.dev Agent Handler work?",
    a: "Pro and Ultra plans include integration with Merge.dev's Agent Handler, giving your agents unified access to 100+ enterprise tools and APIs through a single interface.",
  },
  {
    q: "Is there a free trial for paid plans?",
    a: "Pro and Ultra come with a 7-day free trial. No credit card required to start. Cancel anytime during the trial — you won't be charged.",
  },
  {
    q: "Are there team or enterprise plans?",
    a: "Yes. Enterprise plans offer custom credits, unlimited seats, dedicated support, SLA guarantees, SSO/SAML, and on-premise deployment options. Contact sales for a tailored quote.",
  },
]

const FAQSection = () => {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-[700px] mx-auto">
        <div className="mb-12">
          <h2 className="text-[13px] font-mono uppercase tracking-[0.15em] text-primary mb-4">
            // faq
          </h2>
          <h3 className="text-[28px] md:text-[36px] text-[#A1A1AA] font-semibold tracking-tight leading-[1.15]">
            frequently asked questions
          </h3>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQ.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="border border-border rounded-lg bg-card/20 data-[state=open]:bg-card/40 transition-colors duration-200"
            >
              <AccordionTrigger className="px-5 py-4 text-[14px] font-mono text-foreground hover:no-underline hoverable:hover:text-primary transition-colors duration-150">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-4">
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

export default FAQSection
