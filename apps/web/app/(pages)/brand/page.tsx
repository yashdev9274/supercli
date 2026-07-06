import type { Metadata } from "next"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import BrandPageClient from "./brand-client"

export const metadata: Metadata = {
  title: "Supercode — Brand Guidelines",
  description:
    "Guidelines and assets for presenting the Supercode brand consistently.",
  metadataBase: new URL("https://supercli.vercel.app"),
  openGraph: {
    title: "Supercode — Brand Guidelines",
    description:
      "Guidelines and assets for presenting the Supercode brand consistently.",
    url: "https://supercli.vercel.app/brand",
    siteName: "Supercode",
    type: "website",
    images: [
      {
        url: "/og-image2.png",
        width: 1200,
        height: 630,
        alt: "Supercode Brand Guidelines",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Supercode — Brand Guidelines",
    description:
      "Guidelines and assets for presenting the Supercode brand consistently.",
    images: ["/og-image2.png"],
  },
}

export default function BrandPage() {
  return (
    <main className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <BrandPageClient />

      <Footer />
    </main>
  )
}
