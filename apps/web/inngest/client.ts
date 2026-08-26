import { Inngest } from "inngest"

/**
 * Inngest client for Supercode background jobs
 * (`pr.review.requested`, `repository-connected`).
 *
 * Event routing:
 * - `INNGEST_DEV=1` → local Inngest Dev Server (npx inngest-cli dev)
 * - otherwise SDK uses `INNGEST_EVENT_KEY` → Inngest Cloud
 *
 * Important: do NOT set cloud keys in local `.env` without either
 * `INNGEST_DEV=1` or a cloud app synced to a reachable serve URL.
 * Cloud accepts events even when no worker will ever run them.
 */
export const inngest = new Inngest({
  id: "supercode",
  // Explicit so sends fail loudly if the key is missing in cloud mode.
  eventKey: process.env.INNGEST_EVENT_KEY,
})
