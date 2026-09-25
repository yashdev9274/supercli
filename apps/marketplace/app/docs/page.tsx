export default function DocsPage() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 48 }}>
      <h1>Supercode Review — Marketplace docs</h1>
      <p>
        Supercode Review is an AI PR review product installed from the Vercel
        Marketplace (native integration), similar to CodeRabbit.
      </p>
      <h2>Install</h2>
      <ol>
        <li>
          Open the listing (after publish):{" "}
          <code>https://vercel.com/marketplace/supercode-review</code> or{" "}
          <code>vc i supercode-review</code>
        </li>
        <li>Choose a plan (Free / Pro / Team)</li>
        <li>Provision the Supercode Review resource</li>
        <li>
          Finish setup in Supercode: install the GitHub App and select repos
        </li>
        <li>Open a test PR — Supercode posts summary + inline comments</li>
      </ol>
      <h2>What this server does</h2>
      <p>
        Vercel calls this integration server (Base URL) for Partner API:
        installations upsert/delete, resource provision/get/delete, and product
        billing plans. Reviews themselves still run via the Supercode GitHub App
        + existing Inngest review pipeline in <code>apps/web</code>.
      </p>
    </main>
  )
}
