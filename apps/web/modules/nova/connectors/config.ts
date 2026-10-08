import type { NovaProvider } from "@super/nova"

export type NativeConnectorProvider = Exclude<NovaProvider, "desktop" | "web">

export type ConnectorDefinition = {
  provider: NativeConnectorProvider
  displayName: string
  requiredConversationScopes: readonly string[]
  authorizeUrl: (state: string) => URL | null
}

function appUrl(path: string): string {
  const base = (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3003"
  ).replace(/\/$/, "")
  return `${base}${path}`
}

const definitions: Record<NativeConnectorProvider, ConnectorDefinition> = {
  slack: {
    provider: "slack",
    displayName: "Slack",
    requiredConversationScopes: [
      "app_mentions:read",
      "chat:write",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
    ],
    authorizeUrl: (state) => {
      const clientId = process.env.NOVA_SLACK_CLIENT_ID?.trim()
      if (!clientId) return null
      const url = new URL("https://slack.com/oauth/v2/authorize")
      url.searchParams.set("client_id", clientId)
      url.searchParams.set("scope", definitions.slack.requiredConversationScopes.join(","))
      url.searchParams.set("redirect_uri", appUrl("/api/nova/connectors/slack/callback"))
      url.searchParams.set("state", state)
      return url
    },
  },
  linear: {
    provider: "linear",
    displayName: "Linear",
    requiredConversationScopes: ["read", "comments:create", "app:mentionable", "app:assignable"],
    authorizeUrl: (state) => {
      const clientId = process.env.NOVA_LINEAR_CLIENT_ID?.trim()
      if (!clientId) return null
      const url = new URL("https://linear.app/oauth/authorize")
      url.searchParams.set("client_id", clientId)
      url.searchParams.set("redirect_uri", appUrl("/api/nova/connectors/linear/callback"))
      url.searchParams.set("response_type", "code")
      url.searchParams.set("scope", definitions.linear.requiredConversationScopes.join(","))
      url.searchParams.set("actor", "app")
      url.searchParams.set("state", state)
      return url
    },
  },
  github: {
    provider: "github",
    displayName: "GitHub",
    requiredConversationScopes: [
      "metadata:read",
      "issues:write",
      "pull_requests:write",
      "contents:write",
      "checks:read",
    ],
    authorizeUrl: (state) => {
      const slug = process.env.NOVA_GITHUB_APP_SLUG?.trim()
      if (!slug) return null
      const url = new URL(`https://github.com/apps/${slug}/installations/new`)
      url.searchParams.set("state", state)
      return url
    },
  },
}

export function connectorDefinition(provider: string): ConnectorDefinition | null {
  return provider === "slack" || provider === "linear" || provider === "github"
    ? definitions[provider]
    : null
}

export function connectorCallbackUrl(provider: NativeConnectorProvider): string {
  return appUrl(`/api/nova/connectors/${provider}/callback`)
}
