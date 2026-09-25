import { Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import LaunchBanner from "@/components/launch-banner";

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${schibstedGrotesk.variable} ${geistMono.variable} landing-fonts`}
    >
      {/* <LaunchBanner /> */}
      {children}
    </div>
  );
}
