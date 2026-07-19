export interface Partner {
  slug: string
  name: string
  logo: string
  logoSrc?: string
  tagline: string
  stat: { value: string; label: string }
  quote: { text: string; author: string; role: string }
  challenge: string[]
  solution: string[]
  results: { text: string; metric: string }[]
  description: string
}

export const partners: Partner[] = [
  {
    slug: "concentrateai",
    name: "Concentrate AI",
    logo: "CA",
    logoSrc: "/concentrate-ai-black-symbol.svg",
    description: "A strategic partnership bringing together Supercode's AI code generation with Concentrate AI's LLM API gateway infrastructure.",
    tagline: "Powering the next generation of AI-assisted development",
    stat: { value: "99.9%", label: "LLM API uptime via Concentrate AI gateway" },
    quote: {
      text: "Supercode and Concentrate AI are building the future of AI-assisted development together. Their code generation platform paired with our gateway infrastructure means developers get the best of both worlds — intelligent automation with enterprise-grade reliability.",
      author: "Alex Rivera",
      role: "CTO, Concentrate AI",
    },
    challenge: [
      "Supercode's AI-powered code generation relies on large language models — but managing LLM API traffic at scale is a complex infrastructure problem. Rate limits, cost optimization, failover across providers, and consistent latency for users all needed to be solved before Supercode could deliver a reliable experience to its growing user base.",
      "Building this infrastructure in-house would have diverted engineering resources from Supercode's core product. What was needed was a dedicated API gateway purpose-built for LLM traffic — and a partner who understood both the infrastructure and developer experience sides of the problem.",
    ],
    solution: [
      "Supercode partnered with Concentrate AI to integrate their enterprise-grade LLM API gateway as the backbone of Supercode's AI infrastructure. Concentrate AI's gateway handles request routing across multiple LLM providers (OpenAI, Anthropic, Groq), automatic failover, token usage optimization, and real-time cost tracking — all abstracted behind a single, unified API.",
      "In return, Concentrate AI adopted Supercode across their own engineering team to accelerate development of their gateway platform. Their engineers use Supercode to rapidly prototype new routing logic, generate integration tests for provider APIs, and maintain consistent code quality across their growing codebase. It's a true partnership — each company empowers the other's core product.",
    ],
    results: [
      { text: "Supercode achieved enterprise-grade LLM infrastructure without building it in-house, powered by Concentrate AI's gateway", metric: "Zero-infra AI" },
      { text: "Concentrate AI's engineering team ships gateway features 3x faster using Supercode for development", metric: "3x faster shipping" },
      { text: "Users get reliable, low-latency code generation with automatic failover across multiple LLM providers", metric: "99.9% uptime" },
    ],
  },
  {
    slug: "mergedev",
    name: "Merge",
    logo: "MD",
    description:
      "Supercode's AI coding agents connect to 200+ developer tools through Merge's Agent Handler, giving AI governed access to the entire development workflow.",
    tagline: "Connective infrastructure for production AI",
    stat: { value: "200+", label: "Integrations available through Merge's Unified API" },
    quote: {
      text: "Supercode's AI agents needed to interact with the same tools developers use every day — GitHub, Jira, Linear, Slack. Merge's Agent Handler gave us governed, authenticated access to hundreds of integrations out of the box. It's the infrastructure layer that makes AI-assisted development actually practical.",
      author: "Yash Dewasthale",
      role: "Founder, Supercode",
    },
    challenge: [
      "For Supercode's AI coding agents to be truly useful, they needed to interact with the tools developers already use — opening PRs on GitHub, creating tickets in Linear or Jira, posting updates in Slack, managing deployments on Vercel. Building and maintaining individual integrations for every tool would have been a massive, ongoing engineering effort.",
      "Each integration required OAuth flows, API versioning, rate limit handling, pagination, error handling, and ongoing maintenance as APIs evolved. What Supercode needed was a unified connectivity layer that abstracted away the complexity of individual tool integrations — so agents could focus on being helpful, not on plumbing.",
    ],
    solution: [
      "Supercode integrated Merge's Agent Handler and Unified API as the connectivity backbone for AI agent tool access. Merge handles authentication, rate limiting, pagination, and API versioning across 200+ developer tools — all behind a single, consistent API. Supercode agents can now read issues, create PRs, review code, post messages, and trigger deployments across any supported tool without handling a single integration detail.",
      "In turn, Merge adopted Supercode across their engineering organization to accelerate development of their integration platform. Merge engineers use Supercode to rapidly prototype new connectors, generate integration test suites for third-party APIs, and maintain code quality as their connector catalog grows. Each company builds what the other needs — Merge owns the connectivity infrastructure, Supercode owns the AI agent experience.",
    ],
    results: [
      { text: "Supercode agents access 200+ developer tools through a single integration, not 200 individual ones", metric: "One integration" },
      { text: "Merge's engineering team ships new connectors 2x faster using Supercode for development", metric: "2x faster connectors" },
      { text: "Users get governed, authenticated agent actions with full audit trails — no security compromises", metric: "Full audit trail" },
    ],
  },
  {
    slug: "dodopayments",
    name: "Dodo Payments",
    logo: "DP",
    description:
      "Supercode uses Dodo Payments for subscription billing — powering checkout, recurring payments, and license fulfillment for Pro and Ultra tiers.",
    tagline: "Developer-friendly payment infrastructure for digital products",
    stat: { value: "<$1M", label: "Processed in subscription revenue through Dodo Payments" },
    quote: {
      text: "We needed a payment stack that just worked — subscriptions, licensing, global tax compliance — without building a fintech company inside a dev tool company. Dodo Payments gave us a single API for checkout, recurring billing, and webhook-driven license fulfillment. It turned a months-long project into a weekend integration.",
      author: "Yash Dewasthale",
      role: "Founder, Supercode",
    },
    challenge: [
      "Supercode needed to monetize its Pro and Ultra tiers with subscription billing — but payment infrastructure is a project that never ends. Beyond basic checkout, there were recurring billing cycles, dunning management, license key generation and validation, global tax compliance (VAT, GST, sales tax), multi-currency support, and customer portal access for users to manage their own subscriptions.",
      "Building this in-house would have diverted months of engineering time away from Supercode's core AI product. What was needed was a payment partner that understood SaaS billing for developer tools — with a clean API, webhook-driven architecture, and built-in compliance for selling software globally.",
    ],
    solution: [
      "Supercode integrated Dodo Payments as its billing infrastructure. Dodo's Checkout Sessions handle one-time and subscription purchases with a hosted, localized checkout experience. Webhooks drive the entire post-payment workflow — on `payment.succeeded`, Supercode generates and delivers license keys; on `subscription.renewed`, it extends access; on `subscription.cancelled`, it gracefully degrades the tier. Dodo's Better-Auth plugin ties user authentication to subscription status seamlessly.",
      "Dodo Payments' engineering team adopted Supercode to accelerate development of their SDKs, API clients, and integration examples. Their developers use Supercode to rapidly generate idiomatic SDK code across Node.js, Python, Go, and PHP — ensuring every language client stays in sync with API changes. It's a partnership where Supercode handles the AI, Dodo handles the payments, and both teams ship faster because of each other.",
    ],
    results: [
      { text: "Supercode launched subscription billing in days instead of months with Dodo's checkout sessions and webhooks", metric: "Days to launch" },
      { text: "Automatic VAT, GST, and sales tax handling for global customers — zero compliance overhead", metric: "Global compliance" },
      { text: "Dodo Payments ships SDK updates 3x faster across 4 languages using Supercode for code generation", metric: "3x faster SDKs" },
    ],
  },
]
