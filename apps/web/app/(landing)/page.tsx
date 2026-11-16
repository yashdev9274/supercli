import type { Metadata } from "next"
import Image from "next/image"
import { Check } from "lucide-react"

import Navbar from "@/components/homepage/navbar"
import HeroSection from "@/components/homepage/hero"
import SponsorsSection from "@/components/homepage/sponsors-section"
import FeaturesSection from "@/components/homepage/features-section"
import ConnectorsSection from "@/components/homepage/connectors-section"
import PartnershipsSection from "@/components/homepage/partnerships-section"
import ProvidersSection from "@/components/homepage/providers-section"
import ChangelogCard from "@/components/homepage/changelog-card"
import FAQSection from "@/components/homepage/faq-section"
import Footer from "@/components/homepage/footer"
import CodingAgentsSection from "@/components/homepage/coding-agents-section"
import styles from "./nova-landing.module.css"

export const metadata: Metadata = {
  title: "Nova — Your next idea, shipped.",
  description:
    "Your AI engineering workspace. Bring your coding subscriptions, work across threads, and keep your code, tools, and agents in one place.",
}

export default function Home() {
  return (
    <main id="top" className="min-h-screen bg-background dark relative">
      <div className="fixed top-0 left-0 w-px h-full bg-border z-50" />
      <div className="fixed top-0 right-0 w-px h-full bg-border z-50" />
      <Navbar />
      <div className={styles.page}>
        <HeroSection />
        <section
          id="workspace"
          className={styles.workspace}
          aria-labelledby="workspace-title"
        >
          <div className={styles.sectionTop}>
            <p className={styles.eyebrow}>ONE WORKSPACE. LESS FRICTION.</p>
            <span className={styles.liveLabel}>
              <span /> Built for the way you work
            </span>
          </div>
          <div className={styles.workspaceHeading}>
            <h2 id="workspace-title">
              Big ideas.
              <br />
              <span>Room to build them.</span>
            </h2>
            <p>
              Your threads, agents, files, and browser.
              <br />
              Finally on the same page.
            </p>
          </div>
          <div className={styles.dashboard}>
            <div className={styles.windowBar}>
              <span className={styles.windowDots}>
                <i />
                <i />
                <i />
              </span>
              <span>nova / workspace</span>
              <span className={styles.windowStatus}>
                <span /> All systems ready
              </span>
            </div>
            <Image
              src="/homepage/nova-workspace.png"
              alt="Nova web app with conversation threads, a model picker, and an overview panel for diffs, files, browser, and tasks"
              width={1920}
              height={1038}
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
          </div>
          <div className={styles.workspaceNotes}>
            <span>
              <Check size={14} /> Context that stays with your work
            </span>
            <span>
              <Check size={14} /> Your choice of model
            </span>
            <span>
              <Check size={14} /> Changes you can review
            </span>
          </div>
        </section>
      </div>
      <SponsorsSection />
      <FeaturesSection />
      <div className={styles.page}>
        <CodingAgentsSection />
      </div>
      <ConnectorsSection />
      <PartnershipsSection />
      <ProvidersSection />
      <ChangelogCard />
      <FAQSection />
      <Footer />
    </main>
  )
}
