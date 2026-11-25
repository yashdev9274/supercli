import Image from "next/image"
import { ArrowUpRight } from "lucide-react"

import { PROVIDER_INTEGRATION_BY_ID } from "@/modules/nova-web/provider-integrations"
import styles from "@/app/(landing)/nova-landing.module.css"

const agents = [
  { id: "claude-code", connection: "Setup token" },
  { id: "codex", connection: "ChatGPT subscription" },
  { id: "github-copilot", connection: "Device sign-in" },
  { id: "cursor", connection: "Cloud Agents API key" },
  { id: "opencode", connection: "Go API key" },
  { id: "kimi", connection: "Coding plan API key" },
  { id: "zai-coding", connection: "Coding plan API key" },
  { id: "supergrok", connection: "Device sign-in" },
]

export default function CodingAgentsSection() {
  return (
    <section
      id="agents"
      className={styles.agents}
      aria-labelledby="agents-title"
    >
      <div className={styles.agentsHeading}>
        <div>
          <p className={styles.eyebrow}>FAMILIAR AGENTS. A NEW HOME.</p>
          <h2 id="agents-title">
            <span>Bring your own subscriptions.</span> Work with the coding
            tools you already know.
          </h2>
        </div>
        <a href="https://nova.supercodeai.tech/settings">
          Explore integrations <ArrowUpRight size={16} />
        </a>
      </div>
      <div className={styles.agentGrid}>
        {agents.map(({ id, connection }) => {
          const provider = PROVIDER_INTEGRATION_BY_ID[id]
          return (
            <a
              key={id}
              href="https://nova.supercodeai.tech/settings"
              className={styles.agentCard}
            >
              <Image
                src={provider.logo.src}
                alt=""
                width={44}
                height={44}
                className={
                  provider.logo.monochrome ? styles.monochrome : undefined
                }
              />
              <ArrowUpRight className={styles.agentArrow} size={17} />
              <h3>{provider.label}</h3>
              <p>{connection}</p>
            </a>
          )
        })}
      </div>
      <div className={styles.agentNote}>
        <span>Your tools. Your choice.</span>
        <p>
          Connect an existing subscription or coding-plan API key. Provider
          limits and permissions still apply.
        </p>
      </div>
    </section>
  )
}
