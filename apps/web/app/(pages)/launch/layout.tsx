import type { Metadata } from "next"

export const metadata: Metadata = {
  openGraph: {
    images: [
      {
        url: "/og-image-beta-launch.png",
        width: 1200,
        height: 630,
        alt: "Supercode Beta Launch - June 22, 2026",
      },
    ],
  },
  twitter: {
    images: ["/og-image-beta-launch.png"],
  },
}

export default function LaunchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
