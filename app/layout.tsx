import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/components/providers/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
      </body>
    </html>
  );
}
