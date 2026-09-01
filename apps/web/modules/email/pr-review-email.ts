import prisma from "@super/db"
import {
  extractFindingsSection,
  parseFindings,
  severityRank,
} from "@/modules/bugs-caught/lib/parse-findings"
import {
  getCodeReviewAppUrl,
  getDashboardBaseUrl,
  getResend,
  getResendFromAddress,
} from "./resend"

export type NotifyPrReviewEmailInput = {
  userId: string
  owner: string
  repo: string
  prNumber: number
  prTitle: string
  prUrl: string
  prAuthor: string
  prDescription?: string
  reviewMarkdown: string
  reviewId: string | null
}

export type NotifyPrReviewEmailResult =
  | { skipped: true; reason: string }
  | { skipped: false; emailId: string | null }

const MAX_FINDINGS = 8
const MAX_SUMMARY_CHARS = 480
const MAX_FINDING_TITLE_CHARS = 120

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function severityTag(severity: string): {
  tag: string
  color: string
  bg: string
} {
  switch (severity.toLowerCase()) {
    case "critical":
      return { tag: "C", color: "#f87171", bg: "rgba(248,113,113,0.12)" }
    case "high":
      return { tag: "H", color: "#fb923c", bg: "rgba(251,146,60,0.12)" }
    case "medium":
      return { tag: "M", color: "#facc15", bg: "rgba(250,204,21,0.12)" }
    case "low":
    case "nit":
    default:
      return { tag: "L", color: "#a1a1aa", bg: "rgba(161,161,170,0.12)" }
  }
}

function extractSummary(reviewMarkdown: string, fallback: string): string {
  const match = reviewMarkdown.match(
    /###\s*Summary\s*\n+([\s\S]*?)(?=\n###\s|\n##\s|$)/i,
  )
  const raw = (match?.[1] || fallback || "").replace(/\s+/g, " ").trim()
  if (!raw) return "No summary available."
  if (raw.length <= MAX_SUMMARY_CHARS) return raw
  return `${raw.slice(0, MAX_SUMMARY_CHARS - 1)}…`
}

function buildFindingsHtml(reviewMarkdown: string): {
  html: string
  count: number
} {
  const section = extractFindingsSection(reviewMarkdown)
  const findings = parseFindings(section)
    .slice()
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, MAX_FINDINGS)

  if (findings.length === 0) {
    return {
      count: 0,
      html: `<tr><td colspan="2" style="padding:14px 16px;font-size:13px;color:#888890;">No blocking issues found.</td></tr>`,
    }
  }

  const rows = findings.map((f, index) => {
    const { tag, color, bg } = severityTag(f.severity)
    const title = escapeHtml(
      (f.title || "Finding").slice(0, MAX_FINDING_TITLE_CHARS),
    )
    const isLast = index === findings.length - 1
    const border = isLast ? "" : "border-bottom:1px solid #222228;"

    return `<tr>
  <td style="padding:12px 14px;${border}vertical-align:top;width:36px;">
    <span style="display:inline-block;min-width:22px;text-align:center;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:${color};background:${bg};">${tag}</span>
  </td>
  <td style="padding:12px 14px 12px 0;${border}font-size:13px;line-height:1.45;color:#c8c8c8;">
    ${title}
  </td>
</tr>`
  })

  let html = rows.join("")
  // Resend template variables max out at 2,000 chars — keep headroom.
  const MAX_HTML = 1900
  if (html.length > MAX_HTML) {
    const kept: string[] = []
    let size = 0
    for (const row of rows) {
      if (size + row.length > MAX_HTML) break
      kept.push(row)
      size += row.length
    }
    html =
      kept.join("") ||
      `<tr><td colspan="2" style="padding:14px 16px;font-size:13px;color:#888890;">${findings.length} finding(s) — open the dashboard for full details.</td></tr>`
  }
  return { html, count: findings.length }
}

function buildDashboardUrl(reviewId: string | null): string {
  const base = getDashboardBaseUrl()
  if (reviewId) return `${base}/pull-requests/${reviewId}`
  return `${base}/pull-requests`
}

function buildInlineHtml(vars: {
  userName: string
  prAuthor: string
  prTitle: string
  prNumber: string
  repo: string
  prSummary: string
  findingsHtml: string
  findingsCount: string
  githubUrl: string
  dashboardUrl: string
  appUrl: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0c0c0d;color:#c8c8c8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0d;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#121214;border:1px solid #222228;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #222228;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td><span style="font-size:13px;font-weight:700;letter-spacing:0.12em;color:#E78A53;text-transform:uppercase;">Supercode</span></td>
                <td align="right"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(231,138,83,0.12);border:1px solid rgba(231,138,83,0.25);font-size:11px;font-weight:600;color:#E78A53;">Review complete</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 6px;font-size:13px;color:#888890;">Hi ${escapeHtml(vars.userName)},</p>
            <h1 style="margin:0;font-size:20px;line-height:1.35;font-weight:600;color:#f2f2f2;">
              AI review is ready for<br />
              <span style="color:#E78A53;">${escapeHtml(vars.repo)}#${escapeHtml(vars.prNumber)}</span>
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0c0d;border:1px solid #222228;border-radius:10px;">
              <tr><td style="padding:16px 18px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666670;">Pull request</p>
                <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#f2f2f2;line-height:1.4;">${escapeHtml(vars.prTitle)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" valign="top" style="padding-right:8px;">
                      <p style="margin:0 0 2px;font-size:11px;color:#666670;">Author</p>
                      <p style="margin:0;font-size:13px;color:#c8c8c8;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">@${escapeHtml(vars.prAuthor)}</p>
                    </td>
                    <td width="50%" valign="top" style="padding-left:8px;">
                      <p style="margin:0 0 2px;font-size:11px;color:#666670;">Findings</p>
                      <p style="margin:0;font-size:13px;color:#c8c8c8;">${escapeHtml(vars.findingsCount)} issue(s)</p>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666670;">What this PR is about</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#a8a8b0;">${escapeHtml(vars.prSummary)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666670;">Findings</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #222228;border-radius:10px;overflow:hidden;">
              ${vars.findingsHtml}
            </table>
            <p style="margin:10px 0 0;font-size:11px;color:#55555e;">C critical · H high · M medium · L low</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:8px;">
                  <a href="${escapeHtml(vars.dashboardUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#E78A53;color:#121113;font-size:13px;font-weight:600;text-decoration:none;">Open in dashboard →</a>
                </td>
                <td>
                  <a href="${escapeHtml(vars.githubUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:transparent;border:1px solid #333338;color:#c8c8c8;font-size:13px;font-weight:600;text-decoration:none;">View PR on GitHub</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px;border-top:1px solid #222228;background:#0e0e10;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#55555e;text-align:center;">
              Sent by Supercode after an automated PR review ·
              <a href="${escapeHtml(vars.appUrl)}" style="color:#E78A53;text-decoration:none;">${escapeHtml(vars.appUrl)}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Email the Supercode user who owns the connected repo once a PR review completes.
 * Best-effort: never throws to callers — returns skipped/error reasons instead.
 */
export async function notifyUserOfCompletedReview(
  input: NotifyPrReviewEmailInput,
): Promise<NotifyPrReviewEmailResult> {
  const resend = getResend()
  if (!resend) {
    return { skipped: true, reason: "resend_not_configured" }
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, name: true },
  })

  if (!user?.email) {
    return { skipped: true, reason: "user_email_missing" }
  }

  const repoFullName = `${input.owner}/${input.repo}`
  const { html: findingsHtml, count: findingsCount } = buildFindingsHtml(
    input.reviewMarkdown,
  )
  const prSummary = extractSummary(
    input.reviewMarkdown,
    input.prDescription || input.prTitle,
  )
  const dashboardUrl = buildDashboardUrl(input.reviewId)
  const appUrl = getCodeReviewAppUrl()
  const userName = (user.name || "").trim().split(/\s+/)[0] || "there"
  const prNumber = String(input.prNumber)

  const clip = (value: string, max = 2000) =>
    value.length <= max ? value : `${value.slice(0, max - 1)}…`

  const variables = {
    USER_NAME: clip(userName, 50),
    PR_AUTHOR: clip(input.prAuthor || "unknown", 100),
    PR_TITLE: clip(input.prTitle, 200),
    PR_NUMBER: prNumber,
    REPO: clip(repoFullName, 200),
    PR_SUMMARY: clip(prSummary, 480),
    FINDINGS_HTML: clip(findingsHtml, 1900),
    // Template defines FINDINGS_COUNT as string — keep type aligned.
    FINDINGS_COUNT: String(findingsCount),
    GITHUB_URL: clip(input.prUrl, 500),
    DASHBOARD_URL: clip(dashboardUrl, 500),
    APP_URL: clip(appUrl, 200),
  }

  const from = getResendFromAddress()
  const subject = `Review ready: ${repoFullName}#${prNumber} — ${input.prTitle}`
  const idempotencyKey = input.reviewId
    ? `pr-review/${input.reviewId}`
    : `pr-review/${repoFullName}/${prNumber}`

  // Resend tags: ASCII letters/numbers/underscores/dashes only (no `/`).
  const tagSafeRepo = repoFullName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 256)
  const tags = [
    { name: "category", value: "pr_review" },
    { name: "repo", value: tagSafeRepo },
  ]

  const templateId = process.env.RESEND_PR_REVIEW_TEMPLATE_ID?.trim()

  if (templateId) {
    const { data, error } = await resend.emails.send(
      {
        from,
        to: [user.email],
        subject,
        template: {
          id: templateId,
          variables,
        },
        tags,
      },
      { idempotencyKey },
    )

    if (!error) {
      return { skipped: false, emailId: data?.id ?? null }
    }

    // Template may be draft/unpublished or variables mismatch — fall back to HTML.
    console.error(
      "[pr-review-email] template send failed, falling back to html:",
      error,
    )
  }

  // Inline HTML (works without a published Resend template)
  const html = buildInlineHtml({
    userName: variables.USER_NAME,
    prAuthor: variables.PR_AUTHOR,
    prTitle: variables.PR_TITLE,
    prNumber: variables.PR_NUMBER,
    repo: variables.REPO,
    prSummary: variables.PR_SUMMARY,
    findingsHtml: variables.FINDINGS_HTML,
    findingsCount: String(variables.FINDINGS_COUNT),
    githubUrl: variables.GITHUB_URL,
    dashboardUrl: variables.DASHBOARD_URL,
    appUrl: variables.APP_URL,
  })

  const { data, error } = await resend.emails.send(
    {
      from,
      to: [user.email],
      subject,
      html,
      tags,
    },
    {
      // Distinct key so a failed template attempt does not block HTML retry.
      idempotencyKey: `${idempotencyKey}/html`,
    },
  )

  if (error) {
    console.error("[pr-review-email] html send failed:", error)
    return { skipped: true, reason: error.message || "resend_error" }
  }

  return { skipped: false, emailId: data?.id ?? null }
}
