export const NOVA_RELEASES = [
  {
    version: "0.1",
    date: "2026-10-30",
    dateLabel: "October 30, 2026",
    title: "Meet Nova. Your AI engineering workspace.",
    summary: "From the first thread to the final review. All in one place.",
    introduction: "Nova brings coding agents, your repositories, connected tools, and code review into one workspace. Delegate the work, follow along as it happens, and stay in control of what ships. This is our first release.",
    banner: null,
    features: [
      {
        icon: "threads",
        title: "Threads that turn ideas into work",
        description: "Ask questions about your codebase, investigate bugs, and delegate changes in persistent conversations. Follow streamed responses and tool activity, return to earlier work, and explore a separate direction in a side thread.",
      },
      {
        icon: "folders",
        title: "A workspace that stays organized",
        description: "Keep threads in folders, search your history, and filter by project, participant, creator, or origin. Member avatars, origin icons, unread markers, and sorting help you find the right conversation.",
      },
      {
        icon: "automations",
        title: "Put repeatable work on autopilot",
        description: "Create automations from templates or your own instructions. Run on a schedule, webhook, or supported GitHub, Slack, and Linear events. Choose a model, attach repositories, add conditions, and inspect runs in Nova.",
      },
      {
        icon: "reviews",
        title: "Pull requests, without the context switch",
        description: "Open pull requests in Nova, inspect file diffs, run Supercode Review, and work through AI findings. Keep review context together and publish findings back to GitHub when you’re ready.",
      },
      {
        icon: "security",
        title: "Another set of eyes on code security",
        description: "Use AI review to help surface potential bugs and security issues before merging. Explore findings and tune review rules in the review dashboard. AI findings support your judgment—they don’t replace a security audit.",
      },
      {
        icon: "connections",
        title: "Connect the tools your team already uses",
        description: "Bring GitHub repositories, Slack conversations, and Linear issues into your workflow. Manage supported app connections and discover their available tools through Composio, with approvals for actions that require them.",
      },
      {
        icon: "machines",
        title: "Cloud machines for hands-on engineering",
        description: "Give Nova a sandbox to work with repositories, files, and commands. Choose from the machine sizes available to your deployment and inspect work through the workspace’s terminal and file tools.",
      },
      {
        icon: "models",
        title: "Codex, Claude, and your choice of models",
        description: "Connect your Codex account with device sign-in and load the models available to your account. Use Claude through configured providers such as OpenRouter, Neon, or ConcentrateAI, alongside Supercode Cloud and other supported providers. Model access depends on your provider configuration and plan.",
      },
      {
        icon: "browser",
        title: "A browser you can work in together",
        description: "Let Nova interact with a cloud browser and follow the live session inside the workspace. Take control when you need to, then hand the browser back to the agent to continue.",
      },
      {
        icon: "control",
        title: "You stay in the loop",
        description: "Review approval requests, steer ongoing work, and manage projects, models, activity, and usage from settings. Nova brings the pieces together so you can focus on the outcome, not the tabs.",
      },
    ],
  },
] as const

export const LATEST_NOVA_RELEASE = NOVA_RELEASES[0]
