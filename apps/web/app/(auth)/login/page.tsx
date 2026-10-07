import { headers } from "next/headers"
import { redirect } from "next/navigation"

import LoginUI from "@/modules/components/login-ui"
import { requireUnAuth } from "@/modules/components/utils/auth-utils"

export const dynamic = "force-dynamic"

const NOVA_HOSTS = new Set(["nova.supercodeai.tech", "nova.localhost"])

const LoginPage = async () => {
  const requestHeaders = await headers()
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]
  const host = (forwardedHost ?? requestHeaders.get("host") ?? "").trim()
  const hostname = host.split(":")[0].toLowerCase()

  const isNovaHost = NOVA_HOSTS.has(hostname)
  await requireUnAuth(isNovaHost ? "/app" : "/")

  if (isNovaHost) {
    const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]
      ?? (hostname === "nova.localhost" ? "http" : "https")
    const novaUrl = hostname === "nova.supercodeai.tech"
      ? "https://nova.supercodeai.tech/app"
      : `${protocol}://${host}/app`
    const cliClientUrl = process.env.SUPERCODE_CLI_CLIENT_URL
      ?? (hostname === "nova.localhost"
        ? "http://localhost:3000"
        : "https://supercode-terminal.vercel.app")
    const signInUrl = new URL("/sign-in", cliClientUrl)
    signInUrl.searchParams.set("redirect", novaUrl)
    redirect(signInUrl.toString())
  }

  return <LoginUI />
}

export default LoginPage
