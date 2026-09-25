export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 48 }}>
      <h1>Privacy Policy</h1>
      <p style={{ color: "#a1a1aa" }}>Last updated: September 2026</p>
      <p>
        Supercode Review processes pull request metadata and code diffs solely
        to generate AI code reviews for repositories you connect. We do not sell
        your source code. Data retention, encryption, and subprocessors are
        described in the full policy on the main Supercode site; this page
        satisfies the Vercel Integrations Console Privacy Policy URL requirement
        for Marketplace listing.
      </p>
      <ul>
        <li>Training on your private code: No (unless you opt in explicitly)</li>
        <li>Purpose: deliver PR reviews and product analytics</li>
        <li>Contact: support@supercodeai.com</li>
      </ul>
    </main>
  )
}
