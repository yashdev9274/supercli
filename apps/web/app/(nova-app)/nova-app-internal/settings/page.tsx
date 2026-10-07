import { redirect } from "next/navigation"

import { requireAuth } from "@/modules/components/utils/auth-utils"
import { normalizeSettingsSection } from "@/modules/nova-web/settings-sections"
import { NovaApp } from "@/modules/nova-web/nova-app"
import { listAgentSessions } from "@/modules/nova/sessions/service"

export const dynamic = "force-dynamic"

export default async function NovaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  const session = await requireAuth()
  const params = await searchParams
  const section = params.section ?? null
  if (section && normalizeSettingsSection(section) !== section) {
    redirect("/settings")
  }
  const sessions = await listAgentSessions(session.user.id)

  return (
    <NovaApp
      initialSessions={sessions}
      initialView="settings"
      initialSettingsSection={normalizeSettingsSection(section)}
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    />
  )
}
