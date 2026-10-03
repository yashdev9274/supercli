import type { Metadata } from "next"

import { ReviewSettingsPage } from "@/modules/reviews/components/review-settings-page"

export const metadata: Metadata = {
  title: "Review settings · Supercode",
  description:
    "Customize how Supercode reviews and summarizes your pull requests.",
}

export default function Page() {
  return <ReviewSettingsPage />
}
