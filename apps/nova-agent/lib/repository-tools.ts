import { defineTool } from "eve/tools"
import { SPECIALIST_READ_TOOLS, type SpecialistRole } from "@super/nova-runtime/specialists"
import { canonicalSchemas } from "@super/agent-runtime"
import { signNovaScope } from "@super/nova-runtime/scope"
import { scopeFromPrincipal } from "./scope"
import type { NovaScope } from "./scope"

const names = ["read_file", "search_files", "read_instructions", "write_file", "edit_file", "run_command", "repository_verify", "repository_finish"] as const

export function repositoryTools(scope: NovaScope, specialistRole?: SpecialistRole) {
  return Object.fromEntries((specialistRole ? SPECIALIST_READ_TOOLS : names).map((name) => {
    const schema = canonicalSchemas[name]?.function
    return [name, defineTool({
      description: schema?.description ?? (name === "repository_verify" ? "Run the user-authorized validation commands and capture the current diff digest. Must succeed after the last edit." : "Export the patch only after repository_verify succeeded for the exact current workspace. Does not publish, push or merge."),
      inputSchema: schema ? { type: "object", ...schema.parameters } : { type: "object", properties: {}, additionalProperties: false },
      async execute(args, call) {
        const current = scopeFromPrincipal(call.session.auth.current)
        if (!current?.repositoryRunId || current.repositoryRunId !== scope.repositoryRunId) throw new Error("Repository scope changed")
        const { remoteConfig } = await import("@super/nova-runtime/remote")
        const config = remoteConfig({ ...process.env, NOVA_EVE_URL: process.env.NOVA_CONTROL_PLANE_URL })
        const response = await fetch(`${config.origin}/api/nova/eve/repository-tool`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signNovaScope(current, { secret: config.secret })}` },
          body: JSON.stringify({ callId: call.callId, runtimeSessionId: call.session.id, ...(specialistRole ? { specialistRole } : {}), name, args }),
          redirect: "error", cache: "no-store", signal: AbortSignal.any([call.abortSignal, AbortSignal.timeout(350_000)]),
        })
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Repository operation unavailable (HTTP ${response.status}); uncertain writes will not be repeated`) }
        return await response.json()
      },
    })]
  }))
}
