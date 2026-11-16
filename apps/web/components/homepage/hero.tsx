import { ArrowDown, ArrowUpRight } from "lucide-react"

import styles from "@/app/(landing)/nova-landing.module.css"

export default function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroMedia} aria-hidden="true">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/homepage/nova-hero-poster.jpg"
        >
          <source src="/homepage/nova-hero.mp4" type="video/mp4" />
        </video>
      </div>
      <div className={styles.heroShade} />
      <div className={styles.heroContent}>
        <a href="#agents" className={styles.announcement}>
          <span>YOUR AGENTS. YOUR WORKSPACE.</span> Bring your coding
          subscriptions <ArrowUpRight size={14} />
        </a>
        <h1 id="hero-title">
          Your next idea.
          <br />
          <span>Already in motion.</span>
        </h1>
        <p>
          Meet Nova, your AI engineering workspace.
          <br />
          Bring your agents. Keep your context. Build what’s next.
        </p>
        <div className={styles.heroActions}>
          <a
            className={styles.primaryButton}
            href="https://nova.supercodeai.tech"
          >
            Start building <ArrowUpRight size={17} />
          </a>
          <a
            className={styles.secondaryButton}
            href="https://github.com/yashdev9274/superCli"
          >
            Explore on GitHub <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
      <div className={styles.heroBottom}>
        <a href="#workspace">
          MEET YOUR WORKSPACE <ArrowDown size={14} />
        </a>
      </div>
    </section>
  )
}
