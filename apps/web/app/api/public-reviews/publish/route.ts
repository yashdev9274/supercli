import { auth } from "@/lib/auth"
import { getGithubTokenForUser } from "@/modules/github/lib/github"
import { createPublicReviewPublishHandler } from "@/modules/reviews/public-review-publish"
import { createPublicReviewPublishStore } from "@/modules/reviews/public-review-publish-store"
import { createPublicReviewStore } from "@/modules/reviews/public-review-store"

export const runtime = "nodejs"
export const maxDuration = 120
export const dynamic = "force-dynamic"

export const POST = createPublicReviewPublishHandler({
  getSession: (headers) => auth.api.getSession({ headers }),
  getToken: getGithubTokenForUser,
  cache: createPublicReviewStore(),
  store: createPublicReviewPublishStore(),
})
