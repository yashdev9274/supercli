import { requireAuth } from "@/modules/components/utils/auth-utils"
import { NovaApp } from "@/modules/nova-web/nova-app"
import { listAgentSessions } from "@/modules/nova/sessions/service"

export const dynamic = "force-dynamic"

export default async function NovaSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const session = await requireAuth()
  const { sessionId } = await params
  const sessions = await listAgentSessions(session.user.id)

  return (
    <NovaApp
      initialSessions={sessions}
      initialSessionId={sessionId}
      initialView="session"
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    />
  )
}
