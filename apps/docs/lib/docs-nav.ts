export type NavSection = {
  title: string
  items: { title: string; slug: string }[]
}

export const DOCS_NAV: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Intro", slug: "intro" },
      { title: "Quickstart", slug: "quickstart" },
      { title: "Authentication", slug: "authentication" },
    ],
  },
  {
    title: "Terminal",
    items: [
      { title: "Architecture", slug: "terminal-architecture" },
    ],
  },
]
