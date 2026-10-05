import {
  buildReviewPrompt,
  finalizeReviewText,
  generateReviewText,
  UNTRUSTED_REVIEW_INPUT,
} from "@/modules/ai/lib/pr-review-generation"
import { DEFAULT_REVIEW_SETTINGS } from "./review-settings"
import { PublicReviewError } from "./public-review-errors"
import { PUBLIC_REVIEW_LIMITS, type PublicPrSnapshot } from "./public-review-github"

export async function generatePublicReview(
  snapshot: PublicPrSnapshot,
  signal: AbortSignal,
  generateText: typeof generateReviewText = generateReviewText,
): Promise<string> {
  const settings = {
    ...DEFAULT_REVIEW_SETTINGS,
    includeSequenceDiagram: true,
    includeConfidence: true,
    updateDescription: false,
    imageBadges: false,
  }
  const pr = snapshot.payload.review
  const prompt = buildReviewPrompt({
    ...snapshot.identity,
    title: pr.prTitle,
    description: pr.body ?? "",
    author: pr.author ?? "unknown",
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    fileSummary: snapshot.fileSummary,
    contextBlocks: [],
    diff: snapshot.diff,
    settings,
  })
  const generate = async (input: string): Promise<string> => {
    signal.throwIfAborted()
    if (input.length > PUBLIC_REVIEW_LIMITS.promptChars) {
      throw new PublicReviewError("This pull request contains too much text for a free review. Please use a smaller PR.", 422)
    }
    const text = await generateText(input, { abortSignal: signal, maxAttempts: 4, system: UNTRUSTED_REVIEW_INPUT })
    if (text.length > PUBLIC_REVIEW_LIMITS.markdownChars) {
      throw new PublicReviewError("The generated review was too large. Please try a smaller PR.", 422)
    }
    return text
  }
  const text = await generate(prompt)
  const { review } = await finalizeReviewText(text, {
    title: pr.prTitle,
    fileSummary: snapshot.fileSummary,
    diff: snapshot.diff,
    changedFiles: snapshot.payload.files,
  }, settings, generate)
  signal.throwIfAborted()
  return review
}
