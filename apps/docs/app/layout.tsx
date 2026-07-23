import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import "./globals.css"

export const metadata: Metadata = {
  title: "Docs | Supercode",
  description:
    "Documentation for Supercode — the open source AI SWE agent for your terminal.",
  metadataBase: new URL("https://supercli.vercel.app"),
  openGraph: {
    title: "Supercode Docs",
    description:
      "Documentation for Supercode — the open source AI SWE agent for your terminal.",
    url: "https://supercli.vercel.app/docs",
    siteName: "Supercode",
    images: [
      {
        url: "/og-image2.png",
        width: 1200,
        height: 630,
        alt: "Supercode Docs",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Supercode Docs",
    description:
      "Documentation for Supercode — the open source AI SWE agent for your terminal.",
    images: ["/og-image2.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
