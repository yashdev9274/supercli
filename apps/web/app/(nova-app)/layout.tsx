import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Nova | Supercode",
  description: "Work with Nova, your Supercode engineering agent.",
  metadataBase: new URL("https://nova.supercodeai.tech"),
  openGraph: {
    title: "Nova | Supercode",
    description: "Work with Nova, your Supercode engineering agent.",
    url: "https://nova.supercodeai.tech",
    siteName: "Nova",
    images: [{
      url: "/Nova-OG-image.jpg",
      width: 1200,
      height: 630,
      alt: "Nova — your Supercode engineering agent",
    }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nova | Supercode",
    description: "Work with Nova, your Supercode engineering agent.",
    images: ["/Nova-OG-image.jpg"],
  },
}

export default function NovaAppLayout({ children }: { children: ReactNode }) {
  return children
}
