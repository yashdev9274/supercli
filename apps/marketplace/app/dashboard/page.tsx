export default function DashboardPage() {
  const appUrl = process.env.SUPERCODE_APP_URL || "http://localhost:3000"
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 48 }}>
      <h1>Supercode Review</h1>
      <p style={{ color: "#a1a1aa" }}>
        Marketplace partner dashboard stub. “Open in Supercode” SSO lands on{" "}
        <code>{appUrl}/dashboard</code> via <code>/callback</code>.
      </p>
      <ol style={{ color: "#d4d4d8" }}>
        <li>Install Supercode Review from the Vercel Marketplace</li>
        <li>Provision the product / choose a plan</li>
        <li>Install the Supercode GitHub App on your repos</li>
        <li>Open a PR — AI review posts automatically</li>
      </ol>
    </main>
  )
}
