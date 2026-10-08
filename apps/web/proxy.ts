import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const NOVA_HOSTS = new Set(["nova.supercodeai.tech", "nova.localhost"])
const NOVA_INTERNAL_PATH = "/nova-app-internal"

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]
  const hostname = (forwardedHost ?? request.headers.get("host") ?? "")
    .trim()
    .split(":")[0]
    .toLowerCase()
  const isNovaHost = NOVA_HOSTS.has(hostname)
  const path = request.nextUrl.pathname

  if (!isNovaHost) {
    // Main app host: keep legacy /settings shorthand for the dashboard.
    if (path === "/settings" || path.startsWith("/settings/")) {
      const url = request.nextUrl.clone()
      url.pathname = path === "/settings"
        ? "/dashboard/settings"
        : path.replace(/^\/settings/, "/dashboard/settings")
      return NextResponse.redirect(url)
    }
    if (path.startsWith(NOVA_INTERNAL_PATH)) {
      const novaUrl = process.env.NODE_ENV === "development"
        ? "http://nova.localhost:3003/"
        : "https://nova.supercodeai.tech/"
      return NextResponse.redirect(new URL(novaUrl))
    }
    return NextResponse.next()
  }

  if (path === "/login") return NextResponse.next()

  // Nova host: never send users to the dashboard settings surface.
  if (path === "/dashboard/settings" || path.startsWith("/dashboard/settings/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/settings"
    url.search = request.nextUrl.search
    return NextResponse.redirect(url)
  }

  const url = request.nextUrl.clone()
  if (path === "/" || path === "/app") {
    url.pathname = NOVA_INTERNAL_PATH
  } else if (path.startsWith(NOVA_INTERNAL_PATH)) {
    return NextResponse.next()
  } else {
    url.pathname = `${NOVA_INTERNAL_PATH}${path}`
  }

  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)",
  ],
}
