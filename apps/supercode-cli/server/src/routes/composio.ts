import type { Express, Request } from "express"

type AuthenticatedUser = { id: string }
type Authenticate = (req: Request) => Promise<AuthenticatedUser | null>

async function requireUser(req: Request, authenticate: Authenticate) {
  const user = await authenticate(req)
  if (!user) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 })
  return user
}

function sendError(res: any, error: unknown, fallback: string) {
  const value = error as { message?: string; statusCode?: number }
  res.status(value.statusCode ?? 500).json({ error: value.message || fallback })
}

async function proxyDesktopComposio(req: Request, res: any, authenticate: Authenticate) {
  const user = await requireUser(req, authenticate)
  if (!user) return
  const dashboardUrl = (
    process.env.SUPERCODE_DASHBOARD_API_URL ||
    process.env.SUPERCODE_APP_URL ||
    (process.env.NODE_ENV === "production" ? "https://supercodeai.vercel.app" : "http://localhost:3001")
  ).replace(/\/$/, "")
  const suffix = req.originalUrl.replace(/^\/api\/composio/, "")
  const response = await fetch(`${dashboardUrl}/api/desktop/composio${suffix}`, {
    method: req.method,
    headers: {
      Authorization: req.headers.authorization!,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req.body ?? {}),
    signal: AbortSignal.timeout(120_000),
  })
  const contentType = response.headers.get("content-type") || ""
  const body = await response.text()
  if (!contentType.toLowerCase().includes("application/json")) {
    res.status(response.ok ? 502 : response.status).json({
      error: "The Composio control plane returned an invalid response",
    })
    return
  }
  res.status(response.status).type("application/json").send(body)
}

export function registerComposioRoutes(app: Express, authenticate: Authenticate): void {
  app.post("/api/composio/session", async (req, res) => {
    try {
      await proxyDesktopComposio(req, res, authenticate)
    } catch (error) {
      sendError(res, error, "Composio session creation failed")
    }
  })

  app.post("/api/composio/apps", async (req, res) => {
    try {
      await proxyDesktopComposio(req, res, authenticate)
    } catch (error) {
      sendError(res, error, "Composio list apps failed")
    }
  })

  app.post("/api/composio/connect", async (req, res) => {
    try {
      await proxyDesktopComposio(req, res, authenticate)
    } catch (error) {
      sendError(res, error, "Composio connection failed")
    }
  })

  app.post("/api/composio/disconnect", async (req, res) => {
    try {
      await proxyDesktopComposio(req, res, authenticate)
    } catch (error) {
      sendError(res, error, "Composio disconnect failed")
    }
  })

  app.post("/api/composio/tools", async (req, res) => {
    try {
      await proxyDesktopComposio(req, res, authenticate)
    } catch (error) {
      sendError(res, error, "Composio tools failed")
    }
  })

  app.post("/api/composio/execute", async (req, res) => {
    try {
      await proxyDesktopComposio(req, res, authenticate)
    } catch (error) {
      sendError(res, error, "Composio tool execution failed")
    }
  })
}
