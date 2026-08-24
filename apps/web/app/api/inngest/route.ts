import { serve } from "inngest/next"
import { inngest } from "../../../inngest/client"
import { indexRepo } from "@/inngest/functions"
import { generateReview } from "@/inngest/functions/ai-review"

// Allow long-running index batches on platforms that honor maxDuration
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    indexRepo,
    generateReview,
  ],
})
