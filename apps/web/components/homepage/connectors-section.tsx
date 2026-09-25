import Image from "next/image"

type Connector = {
  slug: "github" | "linear" | "gmail" | "slack" | "notion" | "jira" | "cal" | "googlecalendar"
  name: string
  description: string
}

const CONNECTORS: Connector[] = [
  {
    slug: "github",
    name: "GitHub",
    description: "Fix CI failures and turn issues into pull requests.",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Pick up assigned issues and keep their status current.",
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Turn product requests and bug reports into action.",
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Triage requests and share progress where your team works.",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Build directly from specs, plans, and product context.",
  },
  {
    slug: "jira",
    name: "Jira",
    description: "Take ownership of tickets and deliver reviewed changes.",
  },
  {
    slug: "cal",
    name: "Cal.com",
    description: "Trigger follow-up work from scheduled conversations.",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description: "Prepare for meetings and automate the work after them.",
  },
]

export default function ConnectorsSection() {
  return (
    <section className="border-t border-white/8 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-[760px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary/75">
            Nova connectors
          </p>
          <h2 className="mt-5 text-[36px] font-medium leading-[1.06] tracking-[-0.045em] sm:text-[48px] lg:text-[56px]">
            <span className="text-white/30">Connect once, deliver repeatedly</span>
            <br />
            <span className="text-white/90">with the tools you already use.</span>
          </h2>
        </div>

        <div className="mt-16 grid border-l border-t border-white/8 sm:grid-cols-2 lg:grid-cols-4">
          {CONNECTORS.map((connector) => (
            <article
              key={connector.slug}
              className="group min-h-[180px] border-b border-r border-white/8 p-6 transition-colors duration-200 hoverable:hover:bg-white/[0.025] sm:min-h-[205px] sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] p-2">
                  <Image
                    src={`/logos/connectors/${connector.slug}.svg`}
                    alt=""
                    width={32}
                    height={32}
                    className="h-7 w-7 object-contain"
                  />
                </span>
                <span className="text-[14px] font-medium text-white/68 transition-colors duration-200 group-hover:text-white/88">
                  {connector.name}
                </span>
              </div>
              <p className="mt-10 max-w-[230px] text-[14px] leading-6 text-white/32 transition-colors duration-200 group-hover:text-white/48">
                {connector.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
