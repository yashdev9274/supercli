import { defineMcpClientConnection } from "eve/connections"
import { connect } from "@vercel/connect/eve"

export default defineMcpClientConnection({
  url: "https://mcp.slack.com/sse",
  description: "Slack workspace — messages, channels, threads, and files.",
  auth: connect("slack"),
})
