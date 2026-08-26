import { reviewPullRequest } from "@/modules/ai/action"
import { NextResponse, NextRequest } from "next/server"
import crypto from "crypto"

/** PR actions that should trigger an automatic AI review. */
const REVIEW_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize",
  "ready_for_review",
])

function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`

  // timingSafeEqual throws if buffer lengths differ — guard first
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false

  return crypto.timingSafeEqual(expectedBuf, signatureBuf)
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get("x-hub-signature-256")
    const secret = process.env.GITHUB_WEBHOOK_SECRET
    const deliveryId = req.headers.get("x-github-delivery")
    const event = req.headers.get("x-github-event")

    console.log(
      `[webhook/github] delivery=${deliveryId} event=${event} hasSecret=${Boolean(secret)} hasSig=${Boolean(signature)}`,
    )

    if (secret) {
      if (!verifyWebhookSignature(rawBody, signature, secret)) {
        console.error("[webhook/github] invalid signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    } else {
      console.warn(
        "[webhook/github] GITHUB_WEBHOOK_SECRET is not set — accepting unsigned payloads (dev only)",
      )
    }

    const body = JSON.parse(rawBody)

    if (event === "ping") {
      return NextResponse.json({ message: "Pong", zen: body.zen }, { status: 200 })
    }

    if (event === "pull_request") {
      const action = body.action as string
      const repoFullName = body.repository?.full_name as string | undefined
      const prNumber = (body.number ?? body.pull_request?.number) as
        | number
        | undefined
      const pr = body.pull_request as
        | {
            draft?: boolean
            title?: string
            html_url?: string
            user?: { login?: string }
            head?: { sha?: string }
          }
        | undefined
      const draft = Boolean(pr?.draft)

      if (!repoFullName || !prNumber) {
        console.error("[webhook/github] missing repository or PR number")
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
      }

      const [owner, repoName] = repoFullName.split("/")

      // Auto-queue AI review for new/updated non-draft PRs.
      // Draft PRs wait until ready_for_review (or open as non-draft).
      const shouldReview =
        REVIEW_ACTIONS.has(action) &&
        (action === "ready_for_review" || !draft)

      console.log(
        `[webhook/github] pr=${repoFullName}#${prNumber} action=${action} draft=${draft} shouldReview=${shouldReview} title=${pr?.title ?? ""}`,
      )

      if (shouldReview) {
        try {
          const result = await reviewPullRequest(owner, repoName, prNumber, {
            prTitle: pr?.title,
            source: "github_webhook",
            deliveryId: deliveryId ?? undefined,
          })
          console.log(
            `[webhook/github] queued review for ${repoFullName}#${prNumber}:`,
            result,
          )
        } catch (error) {
          console.error(
            `[webhook/github] failed to queue review for ${repoFullName}#${prNumber}:`,
            error,
          )
          // Still 200 so GitHub does not disable the webhook on transient failures
        }
      }
    }

    return NextResponse.json({ message: "Event Processed" }, { status: 200 })
  } catch (error) {
    console.error("[webhook/github] unhandled error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
