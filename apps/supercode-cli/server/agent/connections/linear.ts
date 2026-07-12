import { defineMcpClientConnection } from "eve/connections"
import { connect } from "@vercel/connect/eve"

export default defineMcpClientConnection({
  url: "https://mcp.linear.app/sse",
  description: "Linear workspace — issues, projects, cycles, and comments.",
  auth: connect("linear"),
})
