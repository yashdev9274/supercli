export type ConnectorStatus = "connected" | "disconnected" | "error"

export interface ConnectorEntry {
  slug: string
  name: string
  description: string
  logo?: string
  provider: string
  status: ConnectorStatus
  category: string
  detail: string
}

export interface ConnectorConfig {
  name: string
  provider: string
  apiKey?: string
  endpointUrl?: string
  extraConfig?: Record<string, string>
}

export interface ConnectorSession {
  connectionId: string
  provider: string
  name: string
  startTime: Date
  status: ConnectorStatus
  endpointUrl: string
}

export const CONNECTOR_CATEGORIES = [
  { slug: "search", name: "Search", description: "Web and domain-specific search engines" },
  { slug: "scrape", name: "Scraping", description: "Web scraping and content extraction" },
  { slug: "crawl", name: "Crawling", description: "Website crawling and mapping" },
  { slug: "research", name: "Research", description: "Deep research and data extraction" },
] as const

export const BUILTIN_CONNECTORS: ConnectorEntry[] = [
  {
    slug: "firecrawl",
    name: "Firecrawl",
    description: "Web search, scrape, map, and crawl. No setup required.",
    provider: "firecrawl",
    status: "connected",
    category: "search",
    detail: "Built-in — always available",
  },
  {
    slug: "exa",
    name: "Exa",
    description: "AI-powered web search and content extraction.",
    provider: "exa",
    status: "connected",
    category: "search",
    detail: "Built-in — always available",
  },
  {
    slug: "web-search",
    name: "Word-wide web",
    provider: "google-custom-search",
    description: "Search and fetch URLs",
    status: "connected",
    category: "search",
    detail: "Built-in — always available",
  },
]
