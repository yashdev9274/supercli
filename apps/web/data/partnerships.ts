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
]
