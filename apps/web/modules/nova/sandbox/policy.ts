import type { NetworkPolicy, NetworkPolicyRule } from "@vercel/sandbox"

export const WORKSPACE = "/vercel/sandbox/repo"
export const WORK_MS = 450_000
export const VM_MS = 540_000
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_PATCH_BYTES = 1_000_000
export const MAX_OUTPUT_BYTES = 20_000

export function sandboxEnabled(userId: string, organizationId: string): boolean {
  if (process.env.NOVA_SANDBOX_ENABLED !== "true") return false
  const allowed = (key: string, id: string) => {
    const ids = (process.env[key] ?? "").split(",").map((value) => value.trim()).filter(Boolean)
    return ids.length === 0 || ids.includes(id)
  }
  return allowed("NOVA_SANDBOX_USER_IDS", userId) && allowed("NOVA_SANDBOX_ORGANIZATION_IDS", organizationId)
}

export function sandboxProvider(): "vercel" | "e2b" {
  const provider = process.env.NOVA_SANDBOX_PROVIDER ?? "vercel"
  if (provider !== "vercel" && provider !== "e2b") throw new Error("Invalid NOVA_SANDBOX_PROVIDER")
  return provider
}

export function sandboxCredentials() {
  const token = process.env.NOVA_SANDBOX_VERCEL_TOKEN
  const teamId = process.env.NOVA_SANDBOX_VERCEL_TEAM_ID
  const projectId = process.env.NOVA_SANDBOX_VERCEL_PROJECT_ID
  if (token || teamId || projectId) {
    if (!token || !teamId || !projectId) throw new Error("Sandbox token, team ID and project ID must all be configured")
    return { token, teamId, projectId }
  }
  // The SDK resolves deployment OIDC (or locally pulled VERCEL_OIDC_TOKEN).
  return {}
}

export function executionPolicy(): NetworkPolicy {
  const domains = (process.env.NOVA_SANDBOX_REGISTRY_DOMAINS ?? "registry.npmjs.org").split(",").map((domain) => domain.trim()).filter(Boolean)
  if (domains.length > 10 || domains.some((domain) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain))) {
    throw new Error("Sandbox registry domains must be exact lowercase DNS names (maximum 10)")
  }
  if (!domains.length) return "deny-all"
  return {
    allow: Object.fromEntries(domains.map((domain) => [domain, [
      { match: { method: ["GET", "HEAD"] }, transform: [{ headers: { Host: domain } }] },
      { response: { statusCode: 403 } },
    ] satisfies NetworkPolicyRule[]])),
  }
}

export function checkoutPolicy(repository: string, token: string): NetworkPolicy {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository binding")
  const headers = { Host: "github.com", Authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}` }
  return { allow: { "github.com": [
    { match: { method: ["GET"], path: { exact: `/${repository}.git/info/refs` }, queryString: [{ key: { exact: "service" }, value: { exact: "git-upload-pack" } }] }, transform: [{ headers }] },
    { match: { method: ["POST"], path: { exact: `/${repository}.git/git-upload-pack` } }, transform: [{ headers }] },
    { response: { statusCode: 403 } },
  ] } }
}

export function relativePath(value: string): string {
  if (!value || value.length > 512 || value.startsWith("/") || value.includes("\\") || /[\x00-\x1f]/.test(value)) throw new Error("Use a relative workspace path")
  if (value.split("/").some((part) => part === ".." || part === ".git")) throw new Error("Path is outside the editable workspace")
  return value
}
