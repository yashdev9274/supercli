import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/components/providers/query-provider";
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: "Supercode - CLI AI Coding Agent for developers",
  description: "Work with superCli directly in your codebase. Build, debug, and ship from your terminal, IDE, Slack, or the web. Describe what you need, and superCli handles the rest.",
  metadataBase: new URL("https://supercli.vercel.app"),
  openGraph: {
    title: "Supercode - CLI AI Coding Agent for developers",
    description: "Work with superCli directly in your codebase. Build, debug, and ship from your terminal, IDE, Slack, or the web. Describe what you need, and superCli handles the rest.",
    url: "https://supercli.vercel.app",
    siteName: "Supercode",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Supercode - CLI AI Coding Agent",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Supercode - CLI AI Coding Agent for developers",
    description: "Work with superCli directly in your codebase. Build, debug, and ship from your terminal, IDE, Slack, or the web.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </QueryProvider>
        <Analytics />
      </body>
    </html>
  );
}
