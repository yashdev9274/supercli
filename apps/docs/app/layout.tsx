import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Docs | Supercode",
  description: "Documentation for Supercode — AI coding agent for the terminal.",
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
