import type { Metadata } from "next"
import Navbar from "@/components/homepage/navbar"
import Footer from "@/components/homepage/footer"
import ContactClient from "./contact-client"

export const metadata: Metadata = {
  title: "Supercode — Contact",
  description:
    "Get in touch with the Supercode team. We'd love to hear from you.",
  metadataBase: new URL("https://supercli.vercel.app"),
  openGraph: {
    title: "Supercode — Contact",
    description:
      "Get in touch with the Supercode team. We'd love to hear from you.",
    url: "https://supercli.vercel.app/contact",
    siteName: "Supercode",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Supercode — Contact",
    description:
      "Get in touch with the Supercode team. We'd love to hear from you.",
  },
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background dark relative mt-30">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />

      <Navbar />

      <div className="pt-[120px] pb-24 px-6 max-w-[1100px] mx-auto mb-30">
        <ContactClient />
      </div>

      <Footer />
    </main>
  )
}
