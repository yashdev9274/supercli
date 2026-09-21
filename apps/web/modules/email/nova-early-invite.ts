import { getResend, getResendFromAddress } from "./resend"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export type NovaInviteEmailResult =
  | { sent: true; emailId: string | null }
  | { sent: false; reason: string }

export async function sendNovaEarlyInviteConfirmation(input: {
  inviteId: string
  name: string
  email: string
}): Promise<NovaInviteEmailResult> {
  const resend = getResend()
  if (!resend) {
    return { sent: false, reason: "resend_not_configured" }
  }

  const firstName = input.name.trim().split(/\s+/)[0] || "there"
  const novaUrl = "https://x.com/dewyashtwts/status/2101545152485691465?s=20"
  const text = `Hey ${firstName}, Yash from Supercode here.

Thanks for signing up for Nova.

We’ve been hacking on an AI engineer that can take a task, work through the code, run the checks, and report back like a teammate.

It’s still early. Not a polished launch. We mostly want to build Nova alongside a small group of engineering teams and learn what is actually useful.

You’re on that list.

We’ll email you as soon as your access is ready. In the meantime, you can take another look here:
${novaUrl}

Talk soon!

- Yash`

  const { data, error } = await resend.emails.send(
    {
      from: getResendFromAddress(),
      to: [input.email],
      subject: "You’re on the Nova list",
      text,
      html: `<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;background:#ffffff;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">A quick note from Yash about Nova.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
      <tr>
        <td style="padding:40px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
            <tr>
              <td style="color:#18181b;font-size:16px;line-height:1.7">
                <p style="margin:0 0 24px">Hey ${escapeHtml(firstName)}, Yash from Supercode here.</p>
                <p style="margin:0 0 24px">Thanks for signing up for Nova.</p>
                <p style="margin:0 0 24px">We’ve been hacking on an AI engineer that can take a task, work through the code, run the checks, and report back like a teammate.</p>
                <p style="margin:0 0 24px">It’s still early. Not a polished launch. We mostly want to build Nova alongside a small group of engineering teams and learn what is actually useful.</p>
                <p style="margin:0 0 24px">You’re on that list.</p>
                <p style="margin:0 0 24px">We’ll email you as soon as your access is ready. In the meantime, you can <a href="${escapeHtml(novaUrl)}" style="color:#c55f2d;text-decoration:underline">take another look at Nova here</a>.</p>
                <p style="margin:0 0 24px">Talk soon!</p>
                <p style="margin:0">- Yash</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      tags: [{ name: "category", value: "nova_early_invite" }],
    },
    { idempotencyKey: `nova-early-invite/${input.inviteId}` },
  )

  if (error) {
    console.error("[nova-early-invite] Resend delivery failed:", error)
    return { sent: false, reason: error.message || "resend_error" }
  }

  return { sent: true, emailId: data?.id ?? null }
}
