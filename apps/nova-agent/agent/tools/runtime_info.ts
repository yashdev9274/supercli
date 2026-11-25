import { defineTool } from "eve/tools"

export default defineTool({
  description: "Report the experimental runtime's actual capabilities, without accessing repositories or credentials",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute() {
    return {
      runtime: "eve",
      version: "1.3.0",
      stage: "compatibility",
      capabilities: ["runtime_info"],
      repositoryAccess: false,
      mutations: false,
    }
  },
})
