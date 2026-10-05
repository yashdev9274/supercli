import type { Metadata } from "next"

import { PublicReviewPage } from "@/modules/reviews/public-review-page"

export const metadata: Metadata = {
  title: "Free Public PR Review — Supercode",
  description:
    "Paste a public GitHub pull request and get a free AI code review. Explore the analysis and diff with no account or GitHub installation required.",
  alternates: { canonical: "/review" },
  openGraph: {
    title: "A second set of eyes for your next PR — Supercode Review",
    description:
      "Review public GitHub pull requests for free. No sign-up, no installation. Just a PR link.",
    images: ["/code-review-og-img.png"],
  },
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ pr?: string | string[] }>
}) {
  const params = await searchParams
  const initialUrl = typeof params.pr === "string" ? params.pr.slice(0, 2048) : ""

  return <PublicReviewPage initialUrl={initialUrl} />
}
