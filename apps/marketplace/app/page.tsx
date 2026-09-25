export default function HomePage() {
  const product = process.env.MARKETPLACE_PRODUCT_SLUG || "supercode-review"
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <p style={{ color: "#a1a1aa", fontSize: 14, letterSpacing: "0.08em" }}>
        VERCEL MARKETPLACE · NATIVE INTEGRATION
      </p>
      <h1 style={{ fontSize: 36, margin: "8px 0 16px" }}>Supercode Review</h1>
      <p style={{ color: "#d4d4d8", fontSize: 18 }}>
        AI code review for modern teams — listed on the Vercel Marketplace like
        CodeRabbit. This host is the{" "}
        <strong>Partner API integration server</strong> (Base URL) Vercel calls
        for installs, product plans, and resource provisioning.
      </p>
      <ul style={{ color: "#a1a1aa", marginTop: 24 }}>
        <li>
          Product slug: <code>{product}</code>
        </li>
        <li>
          Partner API: <code>/v1/installations/…</code>,{" "}
          <code>/v1/products/{"{slug}"}/plans</code>
        </li>
        <li>
          Redirect Login URL: <code>/callback</code>
        </li>
        <li>
          Docs: <a href="/docs" style={{ color: "#fff" }}>/docs</a>
        </li>
      </ul>
    </main>
  )
}
