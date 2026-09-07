import { defineAgent } from "../../lib/define.ts"

export const agent = defineAgent({
  name: "explore",
  description: "Fast file search specialist. Reads and searches only — no modifications.",
  mode: "subagent",
  steps: 8,
  instructions: "explore",
  permission: [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "read_file", pattern: "*", action: "allow" },
    { permission: "search_files", pattern: "*", action: "allow" },
    { permission: "read_instructions", pattern: "*", action: "allow" },
    { permission: "url_fetch", pattern: "*", action: "allow" },
    { permission: "web_search", pattern: "*", action: "allow" },
    { permission: "firecrawl_search", pattern: "*", action: "allow" },
    { permission: "firecrawl_scrape", pattern: "*", action: "allow" },
    { permission: "firecrawl_map", pattern: "*", action: "allow" },
    { permission: "exa_search", pattern: "*", action: "allow" },
    { permission: "exa_fetch", pattern: "*", action: "allow" },
    { permission: "task", pattern: "*", action: "allow" },
  ],
})

export default agent
