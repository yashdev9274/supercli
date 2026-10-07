import { requireAuth } from "@/modules/components/utils/auth-utils"
import { NovaApp } from "@/modules/nova-web/nova-app"
import { listAgentSessions } from "@/modules/nova/sessions/service"

export const dynamic = "force-dynamic"

export default async function NovaConnectionsPage() {
  const session = await requireAuth()
  const sessions = await listAgentSessions(session.user.id)

  return (
    <NovaApp
      initialSessions={sessions}
      initialView="connections"
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    />
  )
}
