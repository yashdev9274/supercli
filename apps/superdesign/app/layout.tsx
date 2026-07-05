import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Superdesign | Supercode",
  description: "AI-powered design workspace — generate prototypes, dashboards, decks, and more.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        {children}
      </body>
    </html>
  )
}
