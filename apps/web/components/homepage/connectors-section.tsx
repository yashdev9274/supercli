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
    description: "Investigate issues, repair failing checks, and open ready-to-review pull requests.",
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Move assigned work from scoped issue to verified implementation.",
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Convert product feedback and bug reports into structured engineering work.",
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Pick up requests, report progress, and return results in the right channel.",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Ground implementation in the specs, decisions, and context your team maintains.",
  },
  {
    slug: "jira",
    name: "Jira",
    description: "Take tickets from backlog through implementation, validation, and review.",
  },
  {
    slug: "cal",
    name: "Cal.com",
    description: "Turn scheduled conversations into clear, trackable follow-up work.",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description: "Prepare the right context before meetings and act on decisions afterward.",
  },
]

export default function ConnectorsSection() {
  return (
    <section className="border-t border-white/8 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="max-w-[760px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary/75">
            Works across your stack
          </p>
          <h2 className="mt-5 text-[36px] font-medium leading-[1.06] tracking-[-0.045em] sm:text-[48px] lg:text-[56px]">
            <span className="text-white/30">Connect the tools that hold your work.</span>
            <br />
            <span className="text-white/90">Nova carries the context between them.</span>
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
