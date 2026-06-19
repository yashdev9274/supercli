import nodemailer from "nodemailer"

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://supercli.com"
const from = process.env.EMAIL_FROM || "yashdev.yvd@gmail.com"
const adminEmail = process.env.RESEND_ADMIN_EMAIL || "yashdev.yvd@gmail.com"
const repoUrl = "https://github.com/yashdev9274/superCli"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "yashdev.yvd@gmail.com",
    pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""),
  },
})

export async function sendWaitlistConfirmation(
  email: string,
  name?: string | null,
): Promise<void> {
  const greeting = name ? `Thanks, ${name}!` : "Thanks!"

  await transporter.sendMail({
    from: `Supercode <${from}>`,
    to: email,
    subject: "You're on the waitlist for Supercode CLI",
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121113;color:#C1C1C1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#121113;padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#121212;border:1px solid #222222;border-radius:8px;padding:40px">
        <tr><td style="text-align:center;padding-bottom:24px">
          <span style="font-size:28px;font-weight:700;color:#E78A53">SUPERCODE</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:8px">
          <h1 style="margin:0;font-size:22px;font-weight:600;color:#C1C1C1">You're on the list</h1>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:24px">
          <p style="margin:0;font-size:15px;color:#888888;line-height:1.6">
            ${greeting} We'll let you know when Supercode CLI is ready.
          </p>
        </td></tr>

        <tr><td style="padding:24px 0;border-top:1px solid #222222">
          <p style="margin:0 0 12px;font-size:14px;color:#C1C1C1;font-weight:600">Help us grow</p>
          <p style="margin:0 0 6px;font-size:14px;color:#888888;line-height:1.5">
            ⭐ Star us on GitHub —
            <a href="${repoUrl}" style="color:#E78A53;text-decoration:none">github.com/yashdev9274/superCli</a>
          </p>
          <p style="margin:0;font-size:14px;color:#888888;line-height:1.5">
            🛠 Contribute — open issues, suggest features, or submit PRs.
          </p>
        </td></tr>

        <tr><td style="text-align:center;padding:24px 0 0;border-top:1px solid #222222">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:6px;background:#E78A53;padding:12px 28px">
                <a href="${repoUrl}" style="color:#121113;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">Star on GitHub →</a>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="text-align:center;padding:20px 0 0">
          <p style="margin:0;font-size:13px;color:#888888">
            Supercode &middot; AI-powered SWE agent &middot;
            <a href="${appUrl}" style="color:#E78A53;text-decoration:none">${appUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}

export async function sendWaitlistNotification(
  email: string,
  name?: string | null,
): Promise<void> {
  await transporter.sendMail({
    from: `Supercode <${from}>`,
    to: adminEmail,
    subject: `New waitlist signup: ${email}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121113;color:#C1C1C1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#121113;padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#121212;border:1px solid #222222;border-radius:8px;padding:40px">
        <tr><td style="text-align:center;padding-bottom:24px">
          <span style="font-size:28px;font-weight:700;color:#E78A53">New Signup</span>
        </td></tr>
        <tr><td style="padding-bottom:16px">
          <p style="margin:0 0 8px;font-size:14px;color:#888888">Email</p>
          <p style="margin:0;font-size:16px;color:#C1C1C1">${email}</p>
        </td></tr>
        <tr><td style="padding-bottom:24px">
          <p style="margin:0 0 8px;font-size:14px;color:#888888">Name</p>
          <p style="margin:0;font-size:16px;color:#C1C1C1">${name || "—"}</p>
        </td></tr>
        <tr><td style="text-align:center;padding:24px 0 0;border-top:1px solid #222222">
          <p style="margin:0;font-size:13px;color:#888888">
            <a href="${appUrl}/waitlist" style="color:#E78A53;text-decoration:none">View waitlist</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}
