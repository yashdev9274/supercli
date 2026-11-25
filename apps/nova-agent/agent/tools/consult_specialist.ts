import { defineDynamic, defineWorkflowTool, type WorkflowToolContext } from "eve/tools"
import { canConsultSpecialist } from "../../lib/specialist-policy"

async function authorize(ctx: WorkflowToolContext) {
  "use step"
  const { scopeFromPrincipal } = await import("../../lib/scope")
  const scope = scopeFromPrincipal(ctx.session.auth.current)
  if (!scope?.repositoryRunId || ctx.session.parent || process.env.NOVA_EVE_SPECIALISTS_ENABLED !== "true" || process.env.NOVA_EVE_REPOSITORY_ENABLED !== "true") throw new Error("Specialist delegation is not authorized")
}

async function consultSpecialist(input: Record<string, unknown>, ctx: WorkflowToolContext) {
    "use workflow"
    await authorize(ctx)
    const response = await ctx.agent(String(input.role)).send(String(input.message), { signal: ctx.abortSignal })
    const result = await response.result()
    if (result.status !== "completed" || typeof result.reply !== "string" || !result.reply.trim()) throw new Error("Specialist did not complete its assignment")
    return { role: input.role, report: result.reply.slice(0, 16_000), truncated: result.reply.length > 16_000, disposition: "Parent must inspect this report; it does not authorize writes or establish passing validation" }
}

const consult = defineWorkflowTool({
  description: "Consult a read-only explorer, implementation-proposal specialist, or independent verifier. Provide a complete bounded assignment; they cannot see your conversation. Review the returned evidence before applying any edits. No child may write or run commands.",
  inputSchema: { type: "object", properties: { role: { type: "string", enum: ["explorer", "implementer", "verifier"] }, message: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["role", "message"], additionalProperties: false },
  execute: consultSpecialist,
  approval: (ctx) => {
    return canConsultSpecialist(ctx.session.auth.current, Boolean(ctx.session.parent), process.env) ? "approved" : "denied"
  },
})

export default defineDynamic((ctx) => {
  return canConsultSpecialist(ctx.session.auth.current, Boolean(ctx.session.parent), process.env) ? consult : null
})
