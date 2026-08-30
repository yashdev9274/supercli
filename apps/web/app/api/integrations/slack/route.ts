import { NextRequest, NextResponse } from "next/server"
import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { getIntegrationsSettingsUrl } from "@/modules/integrations/lib/app-url"
import { beginProviderConnect } from "@/modules/integrations/lib/connect-flow"

export const runtime = "nodejs"

/**
 * GET /api/integrations/slack
 * Start Composio-hosted Slack OAuth for the user's organization.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", request.nextUrl.origin))
    }

    const result = await beginProviderConnect({
      userId: session.user.id,
      provider: "slack",
    })

    if (!result.ok) {
      return NextResponse.redirect(
        getIntegrationsSettingsUrl({ error: result.error }),
      )
    }

    return NextResponse.redirect(result.redirectUrl)
  } catch (error) {
    console.error("Slack Composio connect start error:", error)
    return NextResponse.redirect(
      getIntegrationsSettingsUrl({ error: "slack_start_failed" }),
    )
  }
}
