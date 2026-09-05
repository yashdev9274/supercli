import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Supercode Review — Vercel Marketplace",
  description:
    "Native Vercel Marketplace integration server for Supercode Review (AI PR code review).",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  )
}
