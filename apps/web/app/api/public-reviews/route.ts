import { publicReviewErrorResponse, PublicReviewError } from "@/modules/reviews/public-review-errors"
import { assertPublicReviewSameOrigin, publicReviewSubject, readPublicReviewBody } from "@/modules/reviews/public-review-request"
import { createPublicReviewService } from "@/modules/reviews/public-review-service"
import { createPublicReviewStore } from "@/modules/reviews/public-review-store"

export const runtime = "nodejs"
export const maxDuration = 300
export const dynamic = "force-dynamic"

const reviewPublicPr = createPublicReviewService({ store: createPublicReviewStore() })

export async function GET(request: Request): Promise<Response> {
  try {
    const urls = new URL(request.url).searchParams.getAll("url")
    if (urls.length !== 1) throw new PublicReviewError("Enter one public GitHub pull request URL.", 400)
    const payload = await reviewPublicPr({
      url: urls[0],
      subject: publicReviewSubject(request),
      generate: false,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]),
    })
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return publicReviewErrorResponse(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertPublicReviewSameOrigin(request)
    const { url } = await readPublicReviewBody(request)
    const payload = await reviewPublicPr({
      url,
      subject: publicReviewSubject(request),
      generate: true,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]),
    })
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return publicReviewErrorResponse(error)
  }
}
