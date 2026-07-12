import { defineMcpClientConnection } from "eve/connections"
import { connect } from "@vercel/connect/eve"

export default defineMcpClientConnection({
  url: "https://mcp.github.com/sse",
  description: "GitHub — repositories, issues, pull requests, and code.",
  auth: connect("github"),
})
