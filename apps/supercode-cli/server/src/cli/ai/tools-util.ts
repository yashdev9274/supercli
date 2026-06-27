export function toolsToArray(tools: Record<string, any>): Array<any> {
  return Object.entries(tools).map(([name, fn]) => ({
    type: "function" as const,
    function: {
      name,
      description: fn?.description || "",
      parameters: fn?.parameters || {},
    },
    execute: fn?.execute,
  }))
}

export function toolsObjectToArray(tools: Record<string, any>): Array<any> {
  return toolsToArray(tools)
}
