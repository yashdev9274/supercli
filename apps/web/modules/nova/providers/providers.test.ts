import { createHmac } from "node:crypto"
import { describe, expect, test } from "bun:test"

import { normalizeGitHubEvent } from "./github"
import { normalizeLinearEvent } from "./linear"
import { verifyGitHubSignature, verifyLinearSignature, verifySlackSignature } from "./signatures"
import { normalizeSlackEvent } from "./slack"

describe("Nova provider signatures", () => {
  test("verifies Slack raw-body signatures and rejects stale requests", () => {
    const now = 1_700_000_000_000
    const timestamp = String(now / 1000)
    const rawBody = JSON.stringify({ type: "event_callback" })
    const secret = "slack-secret"
    const signature = `v0=${createHmac("sha256", secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`

    expect(verifySlackSignature({ rawBody, signature, timestamp, secret, now })).toBe(true)
    expect(verifySlackSignature({ rawBody, signature, timestamp, secret, now: now + 300_001 })).toBe(false)
    expect(verifySlackSignature({ rawBody: `${rawBody} `, signature, timestamp, secret, now })).toBe(false)
  })

  test("verifies GitHub raw-body signatures", () => {
    const rawBody = JSON.stringify({ action: "created" })
    const secret = "github-secret"
    const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`

    expect(verifyGitHubSignature({ rawBody, signature, secret })).toBe(true)
    expect(verifyGitHubSignature({ rawBody: `${rawBody} `, signature, secret })).toBe(false)
    expect(verifyGitHubSignature({ rawBody, signature: null, secret })).toBe(false)
  })

  test("verifies Linear raw-body signatures and rejects stale requests", () => {
    const now = 1_700_000_000_000
    const rawBody = JSON.stringify({ type: "AgentSessionEvent" })
    const secret = "linear-secret"
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex")

    expect(verifyLinearSignature({ rawBody, signature, timestamp: String(now), secret, now })).toBe(true)
    expect(verifyLinearSignature({ rawBody, signature, timestamp: null, secret, now })).toBe(true)
    expect(verifyLinearSignature({ rawBody, signature, timestamp: String(now), secret, now: now + 300_001 })).toBe(false)
    expect(verifyLinearSignature({ rawBody, signature: "invalid", timestamp: String(now), secret, now })).toBe(false)
  })
})

describe("Nova provider event normalization", () => {
  test("normalizes Slack mentions to stable thread surfaces", () => {
    const event = normalizeSlackEvent({
      organizationId: "org_1",
      installationId: "install_1",
      botExternalUserId: "U_NOVA",
      envelope: {
        type: "event_callback",
        team_id: "T1",
        event_id: "Ev1",
        event_time: 1_700_000_000,
        event: {
          type: "app_mention",
          user: "U1",
          text: "<@U_NOVA> investigate this",
          ts: "1700000000.001",
          channel: "C1",
        },
      },
    })

    expect(event?.providerDeliveryId).toBe("Ev1")
    expect(event?.surface?.externalSurfaceId).toBe("C1:1700000000.001")
    expect(event?.payload.text).toBe("<@U_NOVA> investigate this")
  })

  test("ignores Slack bot events", () => {
    expect(normalizeSlackEvent({
      organizationId: "org_1",
      installationId: "install_1",
      botExternalUserId: "U_NOVA",
      envelope: {
        type: "event_callback",
        event_id: "Ev2",
        event_time: 1_700_000_000,
        event: {
          type: "message",
          bot_id: "B1",
          user: "U_NOVA",
          text: "loop",
          ts: "1700000000.002",
          channel: "D1",
          channel_type: "im",
        },
      },
    })).toBeNull()
  })

  test("normalizes GitHub issue mentions to stable surfaces", () => {
    const event = normalizeGitHubEvent({
      organizationId: "org_1",
      installationId: "install_1",
      botExternalUserId: "nova-app",
      appSlug: "nova-app",
      eventName: "issue_comment",
      deliveryId: "delivery_github_1",
      envelope: {
        action: "created",
        sender: { login: "octocat", type: "User" },
        repository: { id: 1, full_name: "acme/api" },
        issue: { id: 2, number: 42, title: "Broken API", body: "Details" },
        comment: { id: 3, body: "@nova-app please investigate" },
      },
    })

    expect(event?.providerDeliveryId).toBe("delivery_github_1")
    expect(event?.surface?.externalSurfaceId).toBe("acme/api#42")
    expect(event?.payload.text).toBe("@nova-app please investigate")
  })

  test("normalizes Linear AgentSession prompts", () => {
    const event = normalizeLinearEvent({
      organizationId: "org_1",
      installationId: "install_1",
      botExternalUserId: "app_1",
      deliveryId: "delivery_1",
      envelope: {
        type: "AgentSessionEvent",
        action: "prompted",
        createdAt: "2026-09-27T06:00:00.000Z",
        organizationId: "linear_org_1",
        actor: { id: "user_1" },
        agentSession: { id: "agent_session_1", issue: { id: "issue_1" } },
        agentActivity: { id: "activity_1", body: "Please continue" },
      },
    })

    expect(event?.eventType).toBe("agent_session_prompted")
    expect(event?.surface?.externalSurfaceId).toBe("agent_session_1")
    expect(event?.payload.text).toBe("Please continue")
  })
})
