// Presentation fixtures only: no commands, network calls or tool execution.
export const TOOL_CATEGORY_FIXTURES: [string, string][] = [
  ["run_command", "SHELL"], ["bash", "SHELL"], ["shell", "SHELL"],
  ["read_file", "READ"], ["write_file", "WRITE"], ["edit_file", "EDIT"],
  ["search_files", "FILE SEARCH"], ["grep", "FILE SEARCH"], ["glob", "FILE SEARCH"],
  ["list_files", "FILE LIST"], ["list_directory", "FILE LIST"],
  ["web_search", "WEB SEARCH"], ["exa_search", "WEB SEARCH"], ["firecrawl_search", "WEB SEARCH"],
  ["web_fetch", "WEB FETCH"], ["fetch_url", "WEB FETCH"], ["url_fetch", "WEB FETCH"],
  ["exa_fetch", "WEB FETCH"], ["firecrawl_scrape", "WEB FETCH"], ["firecrawl_map", "WEB SEARCH"],
  ["read_instructions", "READ"], ["skill", "READ"], ["delegate", "AGENT"], ["task", "AGENT"],
  ["question", "QUESTION"], ["ask_question", "QUESTION"], ["todowrite", "TASKS"], ["todoread", "TASKS"],
  ["resolve_file_reference", "FILE LOOKUP"], ["mcp_custom", "TOOL"],
]

export const PRESENTATION_MODES = ["chat", "plan", "agent", "build", "explore", "general"]
