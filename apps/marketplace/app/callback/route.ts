import { type NextRequest, NextResponse } from "next/server"

import { env } from "@/lib/env"
import { exchangeSsoCode } from "@/lib/vercel/marketplace-api"

/**
 * Redirect Login URL for native integration SSO.
 * Vercel sends users here with ?code=&state= (+ optional resource_id, path, support…).
 * After token exchange we send them into the Supercode app dashboard.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const mode = request.nextUrl.searchParams.get("mode")

  if (!code) {
    return new NextResponse("Missing code", { status: 400 })
  }

  try {
    // mode=sso is Vercel-initiated Open in Provider; still exchange the code.
    await exchangeSsoCode(code, state)
  } catch (err) {
    console.error("[marketplace/callback] SSO exchange failed", err)
    // Still allow redirect to app onboarding so users are not stuck;
    // production should surface a proper error page once auth cookies exist.
  }

  const resourceId = request.nextUrl.searchParams.get("resource_id")
  const path = request.nextUrl.searchParams.get("path")
  const support = request.nextUrl.searchParams.get("support")

  const target = new URL(`${env.SUPERCODE_APP_URL}/dashboard`)
  target.searchParams.set("from", "vercel-marketplace")
  if (resourceId) target.searchParams.set("resource_id", resourceId)
  if (path) target.searchParams.set("marketplace_path", path)
  if (support) target.searchParams.set("support", "1")
  if (mode) target.searchParams.set("sso_mode", mode)

  return NextResponse.redirect(target.toString())
}
